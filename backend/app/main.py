import os
import urllib.request
import tempfile
import json
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import UploadRequest, LinkRequest, SearchRequest, ChatRequest
from app.ocr import get_ocr_manager
from app.embeddings import get_embedding_manager
from app.database import get_vector_db
from app.config import settings

# LangChain & LLM Imports
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
import google.generativeai as genai
from groq import Groq

app = FastAPI(title="KnoSnap Backend API", version="1.0.0")

# Enable CORS for Next.js frontend calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper: Download image from URL to local temp file
def download_image_to_temp(image_url: str) -> str:
    try:
        temp_dir = tempfile.gettempdir()
        file_name = os.path.basename(image_url).split('?')[0]
        if not file_name or '.' not in file_name:
            file_name = "temp_screenshot.png"
        
        local_path = os.path.join(temp_dir, file_name)
        
        # In case of custom headers or blockings, use normal User-Agent
        req = urllib.request.Request(image_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            with open(local_path, "wb") as f:
                f.write(response.read())
        return local_path
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to download image: {e}")

# Helper: Direct LLM call for Structured Summarization
def get_structured_summary(ocr_text: str) -> dict:
    # If keys are missing, return a mocked placeholder
    if not settings.gemini_api_key and not settings.groq_api_key:
        print("Warning: Missing API keys. Returning mock summary.")
        return {
            "title": "Mocked Screenshot Summary",
            "description": f"This is a placeholder summary. Set your GEMINI_API_KEY or GROQ_API_KEY in the .env file to enable actual AI extraction. Raw text: {ocr_text[:100]}...",
            "tags": ["mock", "ocr-extracted"]
        }

    prompt = f"""
    Analyze the following raw OCR text extracted from a screenshot/image.
    Provide a structured summary containing:
    1. A short, descriptive title.
    2. A 2-sentence description summarizing what the screenshot contains.
    3. A list of 3-5 relevant keywords/tags.

    OCR TEXT:
    {ocr_text}

    Format your output strictly as a JSON object matching this structure:
    {{
        "title": "descriptive title",
        "description": "2-sentence summary description",
        "tags": ["tag1", "tag2", "tag3"]
    }}
    """
    
    # Bidirectional Fallback logic based on settings
    primary = settings.llm_provider.lower()
    
    if primary == "google":
        # 1. Try Gemini first
        if settings.gemini_api_key:
            try:
                genai.configure(api_key=settings.gemini_api_key)
                model = genai.GenerativeModel(
                    model_name="gemini-3.1-flash-lite",
                    generation_config={"response_mime_type": "application/json"}
                )
                response = model.generate_content(prompt)
                return json.loads(response.text)
            except Exception as e:
                print(f"Primary Gemini summarization failed: {e}. Falling back to Groq...")
        
        # 2. Fallback to Groq
        if settings.groq_api_key:
            try:
                client = Groq(api_key=settings.groq_api_key)
                completion = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model="llama-3.1-8b-instant",
                    response_format={"type": "json_object"}
                )
                return json.loads(completion.choices[0].message.content)
            except Exception as e:
                print(f"Fallback Groq summarization failed: {e}")
                
    else: # Default: groq
        # 1. Try Groq first
        if settings.groq_api_key:
            try:
                client = Groq(api_key=settings.groq_api_key)
                completion = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model="llama-3.1-8b-instant",
                    response_format={"type": "json_object"}
                )
                return json.loads(completion.choices[0].message.content)
            except Exception as e:
                print(f"Primary Groq summarization failed: {e}. Falling back to Gemini...")
                
        # 2. Fallback to Gemini
        if settings.gemini_api_key:
            try:
                genai.configure(api_key=settings.gemini_api_key)
                model = genai.GenerativeModel(
                    model_name="gemini-3.1-flash-lite",
                    generation_config={"response_mime_type": "application/json"}
                )
                response = model.generate_content(prompt)
                return json.loads(response.text)
            except Exception as e:
                print(f"Fallback Gemini summarization failed: {e}")
            
    # Ultimate fallback if APIs fail at runtime
    return {
        "title": "OCR Extracted Screenshot",
        "description": "OCR successfully extracted text, but the AI API endpoints returned an error or rate-limited the request.",
        "tags": ["error", "api-fail"]
    }

# Helper: Web URL text content scraper (Playwright fallback)
def scrape_webpage(url: str) -> str:
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            # launch headless
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, wait_until="networkidle")
            text = page.locator("body").inner_text()
            browser.close()
            return text
    except Exception as e:
        print(f"Playwright scraper failed or not installed: {e}. Falling back to requests...")
        # Basic requests fallback (no JS support)
        try:
            import requests
            from bs4 import BeautifulSoup
            resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=10)
            soup = BeautifulSoup(resp.text, 'html.parser')
            # remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            return soup.get_text()
        except Exception as re_err:
            print(f"Requests scraper failed: {re_err}")
            return f"Link URL: {url}"

# --- API ENDPOINTS ---

@app.get("/")
def read_root():
    return {"message": "KnoSnap API Server is running!"}

@app.post("/api/upload-file")
async def upload_raw_file(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    try:
        import uuid
        item_id = str(uuid.uuid4())
        temp_dir = tempfile.gettempdir()
        file_ext = os.path.splitext(file.filename)[1] or ".png"
        local_path = os.path.join(temp_dir, f"{item_id}{file_ext}")
        
        # Save upload contents
        content = await file.read()
        with open(local_path, "wb") as f:
            f.write(content)
            
        # Run PaddleOCR
        ocr_manager = get_ocr_manager()
        ocr_text = ocr_manager.extract_text(local_path)
        
        if not ocr_text.strip():
            ocr_text = "No readable text found in screenshot."
            
        # Get structured summary
        summary = get_structured_summary(ocr_text)
        
        # Add to ChromaDB
        vector_db = get_vector_db()
        metadata = {
            "type": "screenshot",
            "image_url": f"http://localhost:8000/temp/{item_id}{file_ext}", # Mock local path
            "title": summary.get("title", "Untitled Screenshot"),
            "description": summary.get("description", ""),
            "tags": json.dumps(summary.get("tags", []))
        }
        
        vector_db.add_item(
            item_id=item_id,
            text=f"Title: {metadata['title']}\nDescription: {metadata['description']}\nOCR Text: {ocr_text}",
            metadata=metadata
        )
        
        # We can run cleanup in background or keep it for temporary serve
        if background_tasks:
            # wait 10 seconds before deleting so file can be read if needed, or delete immediately
            background_tasks.add_task(os.remove, local_path)
            
        return {
            "id": item_id,
            "ocr_text": ocr_text,
            "summary": summary,
            "metadata": metadata
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Raw upload processing failed: {e}")

@app.post("/api/upload")
async def upload_screenshot(payload: UploadRequest, background_tasks: BackgroundTasks):
    local_path = payload.local_path
    cleanup_temp = False
    
    # If no local path is provided, download it from Supabase URL
    if not local_path:
        local_path = download_image_to_temp(payload.image_url)
        cleanup_temp = True
        
    try:
        # 1. Run local PaddleOCR to extract text
        ocr_manager = get_ocr_manager()
        ocr_text = ocr_manager.extract_text(local_path)
        
        if not ocr_text.strip():
            ocr_text = "No readable text found in screenshot."
            
        # 2. Get structured summary from LLM
        summary = get_structured_summary(ocr_text)
        
        # 3. Save to local vector database (ChromaDB)
        vector_db = get_vector_db()
        metadata = {
            "type": "screenshot",
            "image_url": payload.image_url,
            "title": summary.get("title", "Untitled Screenshot"),
            "description": summary.get("description", ""),
            "tags": json.dumps(summary.get("tags", []))
        }
        
        # We index the text content
        vector_db.add_item(
            item_id=payload.id,
            text=f"Title: {metadata['title']}\nDescription: {metadata['description']}\nOCR Text: {ocr_text}",
            metadata=metadata
        )
        
        return {
            "id": payload.id,
            "ocr_text": ocr_text,
            "summary": summary,
            "metadata": metadata
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline processing failed: {e}")
    finally:
        # Clean up temp file in background
        if cleanup_temp and os.path.exists(local_path):
            background_tasks.add_task(os.remove, local_path)

@app.post("/api/link")
async def add_bookmark(payload: LinkRequest):
    try:
        # 1. Scrape text content from webpage
        scraped_text = scrape_webpage(payload.url)
        
        # Limit text size to prevent token overflow
        truncated_text = scraped_text[:8000]
        
        # 2. Summarize
        summary = get_structured_summary(truncated_text)
        
        # 3. Add to ChromaDB
        vector_db = get_vector_db()
        metadata = {
            "type": "link",
            "url": payload.url,
            "title": summary.get("title", "Untitled Link"),
            "description": summary.get("description", ""),
            "tags": json.dumps(summary.get("tags", []))
        }
        
        vector_db.add_item(
            item_id=payload.id,
            text=f"Title: {metadata['title']}\nDescription: {metadata['description']}\nWeb Page Content: {truncated_text[:3000]}",
            metadata=metadata
        )
        
        return {
            "id": payload.id,
            "summary": summary,
            "metadata": metadata
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process link: {e}")

@app.post("/api/search")
def search_database(payload: SearchRequest):
    try:
        vector_db = get_vector_db()
        results = vector_db.search_similar(payload.query, limit=payload.limit)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")

@app.post("/api/chat")
def chat_with_brain(payload: ChatRequest):
    # If keys are missing, return a mocked RAG chat response
    if not settings.gemini_api_key and not settings.groq_api_key:
        return {
            "answer": "Hello! I am KnoSnap AI. Please add your GEMINI_API_KEY or GROQ_API_KEY in the backend `.env` file to chat with your saved screenshots. (This is a mock response).",
            "sources": []
        }

    try:
        # 1. Query ChromaDB for similar context documents
        vector_db = get_vector_db()
        context_docs = vector_db.search_similar(payload.question, limit=3)
        
        # Format the context text
        context_str = ""
        sources = []
        for idx, doc in enumerate(context_docs):
            meta = doc["metadata"]
            source_link = meta.get("image_url") if meta.get("type") == "screenshot" else meta.get("url")
            sources.append({
                "title": meta.get("title", "Source"),
                "url": source_link,
                "type": meta.get("type")
            })
            context_str += f"\n[Source {idx+1}: {meta.get('title')}]\n{doc['document']}\n"
            
        if not context_str.strip():
            context_str = "No relevant saved screenshots or bookmarks found in your personal database."

        # 2. Build LangChain models with Fallback Chain
        # Primary Model: Groq Llama-3.3-70b-versatile
        # Fallbacks: Groq Llama-3.1-8b -> Gemini 3.1 Flash Lite -> Gemini 3.5 Flash
        fallback_models = []
        
        if settings.groq_api_key:
            llama_8b = ChatGroq(
                model="llama-3.1-8b-instant",
                groq_api_key=settings.groq_api_key
            )
            # Add to fallbacks
            fallback_models.append(llama_8b)
            
        if settings.gemini_api_key:
            gemini_lite = ChatGoogleGenerativeAI(
                model="gemini-3.1-flash-lite",
                google_api_key=settings.gemini_api_key
            )
            gemini_35 = ChatGoogleGenerativeAI(
                model="gemini-3.5-flash",
                google_api_key=settings.gemini_api_key
            )
            fallback_models.append(gemini_lite)
            fallback_models.append(gemini_35)

        # Initialize the primary model (Groq 70b)
        if settings.groq_api_key:
            primary_model = ChatGroq(
                model="llama-3.3-70b-versatile",
                groq_api_key=settings.groq_api_key
            )
        else:
            # If Groq is missing, make Gemini the primary
            primary_model = ChatGoogleGenerativeAI(
                model="gemini-3.1-flash-lite",
                google_api_key=settings.gemini_api_key
            )
            fallback_models = [ChatGoogleGenerativeAI(model="gemini-3.5-flash", google_api_key=settings.gemini_api_key)]

        # Bind fallbacks
        if fallback_models:
            model_with_fallback = primary_model.with_fallbacks(fallback_models)
        else:
            model_with_fallback = primary_model

        # 3. Construct Prompt
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are KnoSnap AI, an intelligent personal knowledge assistant. 
Your job is to answer the user's question using ONLY the provided personal bookmarks/screenshots context details.
If the answer cannot be verified from the context, state that you do not know. Do not guess or hallucinate.
When referencing details, you can mention the Source number (e.g. [Source 1]).

--- CONTEXT ---
{context}
"""),
            ("human", "{question}")
        ])
        
        # Run chain
        chain = prompt | model_with_fallback
        response = chain.invoke({
            "context": context_str,
            "question": payload.question
        })
        
        return {
            "answer": response.content,
            "sources": sources
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG chat failed: {e}")

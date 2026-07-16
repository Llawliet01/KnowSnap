import os
from datetime import datetime, timezone
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
import cloudinary
import cloudinary.uploader
import urllib.parse

# Configure Cloudinary globally using settings URL
if settings.cloudinary_url:
    try:
        parsed_url = urllib.parse.urlparse(settings.cloudinary_url)
        cloud_name = parsed_url.hostname
        api_key = parsed_url.username
        api_secret = parsed_url.password
        if cloud_name and api_key and api_secret:
            cloudinary.config(
                cloud_name=cloud_name,
                api_key=api_key,
                api_secret=api_secret,
                secure=True
            )
            print(f"Cloudinary: Successfully configured with cloud_name={cloud_name}")
        else:
            print("Cloudinary: Failed to parse configuration URL")
    except Exception as e:
        print(f"Cloudinary configuration failed: {e}")


# --- (Top-level LLM imports removed for startup performance optimization) ---

app = FastAPI(title="Recall AI Backend API", version="1.0.0")

# Helper: Parse comma-separated list of keys from environment
def get_gemini_api_keys() -> list[str]:
    return [k.strip() for k in settings.gemini_api_key.split(",") if k.strip()]

def get_groq_api_keys() -> list[str]:
    return [k.strip() for k in settings.groq_api_key.split(",") if k.strip()]

# Helper: Resize image to speed up CPU OCR calculations
def optimize_image_size(file_path: str) -> None:
    try:
        from PIL import Image
        with Image.open(file_path) as img:
            width, height = img.size
            max_dimension = 800  # Keep 800px limit for massive pixel reduction
            
            if width <= max_dimension and height <= max_dimension:
                return
                
            if width > height:
                new_width = max_dimension
                new_height = int(height * (max_dimension / width))
            else:
                new_height = max_dimension
                new_width = int(width * (max_dimension / height))
                
            # Resize keeping RGB format to prevent model accuracy degradation and extra box checks
            resized_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            img_format = img.format or "PNG"
            resized_img.save(file_path, format=img_format, optimize=True, quality=85)
            print(f"PIL: Optimized size from {width}x{height} to {new_width}x{new_height} (RGB)")
    except Exception as e:
        print(f"PIL Image optimization warning: {e}")

# Helper: Direct Multimodal Gemini Vision call to extract text and summary in 2 seconds
def get_multimodal_ocr_and_summary(image_path: str) -> dict:
    gemini_keys = get_gemini_api_keys()
    if not gemini_keys:
        raise ValueError("Missing GEMINI_API_KEY")
        
    import google.generativeai as genai
    from PIL import Image
    import random
    
    # Shuffle to load-balance across available keys
    shuffled_keys = list(gemini_keys)
    random.shuffle(shuffled_keys)
    
    prompt = """
    Analyze this image and extract the following:
    1. 'ocr_text': The complete, exact raw text found in the image. Do not summarize or skip anything. Keep it formatted as text blocks.
    2. 'title': A short, descriptive title (e.g., 'Groq Model Limits Dashboard' or 'Yug Patel Resume').
    3. 'description': A 2-sentence summary of the content and purpose of the image.
    4. 'tags': A list of 3-5 relevant keywords/tags.
    
    Respond strictly in a JSON object matching this structure:
    {
        "ocr_text": "extracted text",
        "title": "descriptive title",
        "description": "2-sentence summary description",
        "tags": ["tag1", "tag2", "tag3"]
    }
    """
    
    last_err = ValueError("All Gemini keys failed or no keys were provided")
    for idx, key in enumerate(shuffled_keys):
        try:
            img = Image.open(image_path)
            genai.configure(api_key=key)
            # Use gemini-3.5-flash as it is the active, fast, and highly capable multimodal production model
            model = genai.GenerativeModel(
                model_name="gemini-3.5-flash",
                generation_config={"response_mime_type": "application/json"}
            )
            response = model.generate_content([img, prompt])
            return json.loads(response.text)
        except Exception as e:
            print(f"[Gemini Multimodal] Key index {idx} failed: {e}. Trying next...")
            last_err = e
            
    raise last_err

# Helper: Direct Multimodal Groq Vision call to extract text and summary in under 1 second
def get_groq_multimodal_ocr_and_summary(image_path: str) -> dict:
    groq_keys = get_groq_api_keys()
    if not groq_keys:
        raise ValueError("Missing GROQ_API_KEY")
        
    import base64
    import random
    from groq import Groq
    
    with open(image_path, "rb") as image_file:
        base64_image = base64.b64encode(image_file.read()).decode('utf-8')
        
    prompt = """
    Analyze this image and extract the following:
    1. 'ocr_text': The complete, exact raw text found in the image. Do not summarize or skip anything. Keep it formatted as text blocks.
    2. 'title': A short, descriptive title (e.g., 'Groq Model Limits Dashboard' or 'Yug Patel Resume').
    3. 'description': A 2-sentence summary of the content and purpose of the image.
    4. 'tags': A list of 3-5 relevant keywords/tags.
    
    Respond strictly in a JSON object matching this structure:
    {
        "ocr_text": "extracted text",
        "title": "descriptive title",
        "description": "2-sentence summary description",
        "tags": ["tag1", "tag2", "tag3"]
    }
    """
    
    shuffled_keys = list(groq_keys)
    random.shuffle(shuffled_keys)
    
    last_err = ValueError("All Groq keys failed or no keys were provided")
    for idx, key in enumerate(shuffled_keys):
        try:
            client = Groq(api_key=key)
            completion = client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                response_format={"type": "json_object"}
            )
            return json.loads(completion.choices[0].message.content)
        except Exception as e:
            print(f"[Groq Multimodal] Key index {idx} failed: {e}. Trying next...")
            last_err = e
            
    raise last_err

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
    gemini_keys = get_gemini_api_keys()
    groq_keys = get_groq_api_keys()
    
    # If keys are missing, return a mocked placeholder
    if not gemini_keys and not groq_keys:
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

    import random

    # --- UPLOAD SUMMARIZATION: 3-TIER FALLBACK CHAIN WITH KEY ROTATION ---
    # Summarization is a lightweight structured task — use fast/cheap models first,
    # save heavyweight reasoning models for chat/RAG where they matter more.

    # Tier 1: Gemini 3.1 Flash Lite — fast, cheap, excellent JSON structured output
    if gemini_keys:
        shuffled_gemini = list(gemini_keys)
        random.shuffle(shuffled_gemini)
        for idx, key in enumerate(shuffled_gemini):
            try:
                import google.generativeai as genai
                genai.configure(api_key=key)
                gemini_model = genai.GenerativeModel(
                    model_name="gemini-3.1-flash-lite",
                    generation_config={"response_mime_type": "application/json"}
                )
                response = gemini_model.generate_content(prompt)
                return json.loads(response.text)
            except Exception as e:
                print(f"[Upload Tier 1] Gemini Key index {idx} failed: {e}. Trying next...")

    # Tier 2: Groq Llama 8b — different provider, independent rate limits, fast
    if groq_keys:
        shuffled_groq = list(groq_keys)
        random.shuffle(shuffled_groq)
        for idx, key in enumerate(shuffled_groq):
            try:
                from groq import Groq
                client = Groq(api_key=key)
                completion = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model="llama-3.1-8b-instant",
                    response_format={"type": "json_object"}
                )
                return json.loads(completion.choices[0].message.content)
            except Exception as e:
                print(f"[Upload Tier 2] Groq Key index {idx} failed: {e}. Trying next...")

    # Tier 3: Gemini 3.5 Flash — most capable Google model, final safety net
    if gemini_keys:
        shuffled_gemini = list(gemini_keys)
        random.shuffle(shuffled_gemini)
        for idx, key in enumerate(shuffled_gemini):
            try:
                import google.generativeai as genai
                genai.configure(api_key=key)
                gemini_model = genai.GenerativeModel(
                    model_name="gemini-3.5-flash",
                    generation_config={"response_mime_type": "application/json"}
                )
                response = gemini_model.generate_content(prompt)
                return json.loads(response.text)
            except Exception as e:
                print(f"[Upload Tier 3] Gemini Key index {idx} failed: {e}. Trying next...")

    # Ultimate fallback — all APIs down/rate-limited
    return {
        "title": "OCR Extracted Screenshot",
        "description": "OCR successfully extracted text, but all AI summarization APIs are temporarily unavailable.",
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
    return {"message": "Recall AI API Server is running!"}

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
            
        # Optimize image dimensions before passing to local CPU PaddleOCR
        optimize_image_size(local_path)
            
        # Try Groq Multimodal Vision first (takes < 1 second)
        ocr_text = ""
        summary = {}
        processed_by_vision = False
        
        if settings.groq_api_key:
            try:
                print("Processing upload with Groq Llama-4 Scout Vision...")
                data = get_groq_multimodal_ocr_and_summary(local_path)
                ocr_text = data.get("ocr_text", "")
                summary = {
                    "title": data.get("title", "Untitled Screenshot"),
                    "description": data.get("description", ""),
                    "tags": data.get("tags", [])
                }
                processed_by_vision = True
                print("Groq Vision processed successfully!")
            except Exception as e:
                print(f"Groq Vision failed: {e}. Trying Gemini Vision...")
                
        # Try Gemini Multimodal Vision second (fallback)
        if not processed_by_vision and settings.gemini_api_key:
            try:
                print("Processing upload with Gemini Multimodal Vision...")
                data = get_multimodal_ocr_and_summary(local_path)
                ocr_text = data.get("ocr_text", "")
                summary = {
                    "title": data.get("title", "Untitled Screenshot"),
                    "description": data.get("description", ""),
                    "tags": data.get("tags", [])
                }
                processed_by_vision = True
                print("Gemini Multimodal Vision processed successfully!")
            except Exception as e:
                print(f"Gemini Vision failed, falling back to local CPU PaddleOCR: {e}")
                
        if not processed_by_vision:
            # Fallback: Run local CPU PaddleOCR
            ocr_manager = get_ocr_manager()
            ocr_text = ocr_manager.extract_text(local_path)
            
            if not ocr_text.strip():
                ocr_text = "No readable text found in screenshot."
                
            # Get structured summary
            summary = get_structured_summary(ocr_text)
        
        # Upload the compressed image to Cloudinary
        image_url = f"http://localhost:8000/temp/{item_id}{file_ext}" # fallback mock
        if settings.cloudinary_url:
            try:
                print(f"Uploading image to Cloudinary...")
                upload_res = cloudinary.uploader.upload(
                    local_path,
                    folder="recall_ai",
                    public_id=item_id,
                    overwrite=True,
                    resource_type="image"
                )
                image_url = upload_res.get("secure_url") or image_url
                print(f"Cloudinary: Uploaded successfully! URL: {image_url}")
            except Exception as cl_err:
                print(f"Cloudinary upload failed, falling back: {cl_err}")

        # Add to vector database
        vector_db = get_vector_db()
        metadata = {
            "type": "screenshot",
            "image_url": image_url,
            "title": summary.get("title", "Untitled Screenshot"),
            "description": summary.get("description", ""),
            "tags": json.dumps(summary.get("tags", [])),
            "created_at": datetime.now(timezone.utc).isoformat()
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
        # Optimize downloaded image dimensions before passing to local CPU PaddleOCR
        optimize_image_size(local_path)

        # Try Groq Multimodal Vision first (takes < 1 second)
        ocr_text = ""
        summary = {}
        processed_by_vision = False
        
        if settings.groq_api_key:
            try:
                print("Processing URL upload with Groq Llama-4 Scout Vision...")
                data = get_groq_multimodal_ocr_and_summary(local_path)
                ocr_text = data.get("ocr_text", "")
                summary = {
                    "title": data.get("title", "Untitled Screenshot"),
                    "description": data.get("description", ""),
                    "tags": data.get("tags", [])
                }
                processed_by_vision = True
                print("Groq Vision processed successfully!")
            except Exception as e:
                print(f"Groq Vision failed: {e}. Trying Gemini Vision...")

        # Try Gemini Multimodal Vision second (fallback)
        if not processed_by_vision and settings.gemini_api_key:
            try:
                print("Processing URL upload with Gemini Multimodal Vision...")
                data = get_multimodal_ocr_and_summary(local_path)
                ocr_text = data.get("ocr_text", "")
                summary = {
                    "title": data.get("title", "Untitled Screenshot"),
                    "description": data.get("description", ""),
                    "tags": data.get("tags", [])
                }
                processed_by_vision = True
                print("Gemini Multimodal Vision processed successfully!")
            except Exception as e:
                print(f"Gemini Vision failed, falling back to local CPU PaddleOCR: {e}")
                
        if not processed_by_vision:
            # 1. Run local PaddleOCR to extract text
            ocr_manager = get_ocr_manager()
            ocr_text = ocr_manager.extract_text(local_path)
            
            if not ocr_text.strip():
                ocr_text = "No readable text found in screenshot."
                
            # 2. Get structured summary from LLM
            summary = get_structured_summary(ocr_text)
        
        # 3. Save to vector database
        vector_db = get_vector_db()
        metadata = {
            "type": "screenshot",
            "image_url": payload.image_url,
            "title": summary.get("title", "Untitled Screenshot"),
            "description": summary.get("description", ""),
            "tags": json.dumps(summary.get("tags", [])),
            "created_at": datetime.now(timezone.utc).isoformat()
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
        
        # 3. Add to vector database
        vector_db = get_vector_db()
        metadata = {
            "type": "link",
            "url": payload.url,
            "title": summary.get("title", "Untitled Link"),
            "description": summary.get("description", ""),
            "tags": json.dumps(summary.get("tags", [])),
            "created_at": datetime.now(timezone.utc).isoformat()
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

@app.get("/api/items")
def get_items(limit: int = 50):
    try:
        vector_db = get_vector_db()
        results = vector_db.get_all_items(limit=limit)
        return {"items": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch items: {e}")


@app.post("/api/chat")
def chat_with_brain(payload: ChatRequest):
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_groq import ChatGroq
    from langchain_google_genai import ChatGoogleGenerativeAI
    import random

    gemini_keys = get_gemini_api_keys()
    groq_keys = get_groq_api_keys()

    # If keys are missing, return a mocked RAG chat response
    if not gemini_keys and not groq_keys:
        return {
            "answer": "Hello! I am Recall AI. Please add your GEMINI_API_KEY or GROQ_API_KEY in the backend `.env` file to chat with your saved screenshots. (This is a mock response).",
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

        # 2. Build LangChain models with 5-Tier Fallback Chain using rotated key
        fallback_models = []

        selected_groq_key = random.choice(groq_keys) if groq_keys else None
        selected_gemini_key = random.choice(gemini_keys) if gemini_keys else None

        if selected_groq_key:
            llama_8b = ChatGroq(
                model="llama-3.1-8b-instant",
                groq_api_key=selected_groq_key
            )
            gpt_oss_120b = ChatGroq(
                model="openai/gpt-oss-120b",
                groq_api_key=selected_groq_key
            )
            fallback_models.append(llama_8b)
            fallback_models.append(gpt_oss_120b)

        if selected_gemini_key:
            gemini_lite = ChatGoogleGenerativeAI(
                model="gemini-3.1-flash-lite",
                google_api_key=selected_gemini_key
            )
            gemini_35 = ChatGoogleGenerativeAI(
                model="gemini-3.5-flash",
                google_api_key=selected_gemini_key
            )
            fallback_models.append(gemini_lite)
            fallback_models.append(gemini_35)

        # Primary model: Groq Llama 70b (best speed + quality for RAG)
        if selected_groq_key:
            primary_model = ChatGroq(
                model="llama-3.3-70b-versatile",
                groq_api_key=selected_groq_key
            )
        else:
            # If no Groq key, start from Gemini lite as primary
            primary_model = ChatGoogleGenerativeAI(
                model="gemini-3.1-flash-lite",
                google_api_key=selected_gemini_key
            )
            fallback_models = [ChatGoogleGenerativeAI(
                model="gemini-3.5-flash",
                google_api_key=selected_gemini_key
            )]

        # Bind all fallbacks into a single chain
        if fallback_models:
            model_with_fallback = primary_model.with_fallbacks(fallback_models)
        else:
            model_with_fallback = primary_model

        # 3. Construct Prompt
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are Recall AI, an intelligent personal knowledge assistant. 
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

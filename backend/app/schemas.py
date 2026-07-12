from pydantic import BaseModel, Field
from typing import Optional, List

class UploadRequest(BaseModel):
    id: str = Field(..., description="Unique item ID (Supabase row ID)")
    image_url: str = Field(..., description="Supabase public image URL")
    local_path: Optional[str] = Field(None, description="Optional path to locally downloaded image file")

class LinkRequest(BaseModel):
    id: str = Field(..., description="Unique item ID (Supabase row ID)")
    url: str = Field(..., description="Web URL link bookmark")

class SearchRequest(BaseModel):
    query: str = Field(..., description="Semantic search query text")
    limit: Optional[int] = Field(5, description="Number of matches to return")

class ChatMessage(BaseModel):
    role: str = Field(..., description="Role of the message author: 'user' or 'assistant'")
    content: str = Field(..., description="Content string of the chat message")

class ChatRequest(BaseModel):
    question: str = Field(..., description="Active user query/question")
    history: Optional[List[ChatMessage]] = Field(default=[], description="Short term session chat messages")

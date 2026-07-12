from sentence_transformers import SentenceTransformer
from typing import List

class EmbeddingManager:
    def __init__(self):
        print("Loading local SentenceTransformer ('all-MiniLM-L6-v2')...")
        # Downloads model from Hugging Face on first execution
        self.model = SentenceTransformer("all-MiniLM-L6-v2")

    def get_embedding(self, text: str) -> List[float]:
        if not text.strip():
            # all-MiniLM-L6-v2 has 384 dimensions
            return [0.0] * 384
        embedding = self.model.encode(text)
        return embedding.tolist()

embedding_manager = None

def get_embedding_manager():
    global embedding_manager
    if embedding_manager is None:
        embedding_manager = EmbeddingManager()
    return embedding_manager

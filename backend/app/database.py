import chromadb
from app.config import settings
from app.embeddings import get_embedding_manager
from typing import List, Dict, Any

class VectorDB:
    def __init__(self):
        print(f"Initializing ChromaDB connection at: {settings.chroma_persist_dir}")
        self.client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
        self.collection = self.client.get_or_create_collection(
            name="knosnap_items",
            metadata={"hnsw:space": "cosine"} # cosine similarity
        )
        self.embed_manager = get_embedding_manager()

    def add_item(self, item_id: str, text: str, metadata: Dict[str, Any]):
        embedding = self.embed_manager.get_embedding(text)
        self.collection.add(
            ids=[item_id],
            embeddings=[embedding],
            metadatas=[metadata],
            documents=[text]
        )
        print(f"ChromaDB: Indexed item {item_id}")

    def search_similar(self, query_text: str, limit: int = 5) -> List[Dict[str, Any]]:
        query_embedding = self.embed_manager.get_embedding(query_text)
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=limit
        )
        
        formatted_results = []
        if results and 'ids' in results and results['ids'] and results['ids'][0]:
            ids = results['ids'][0]
            metadatas = results['metadatas'][0]
            documents = results['documents'][0]
            # ChromaDB returns distance. For cosine space, distance = 1 - cosine_similarity.
            # So similarity = 1 - distance
            distances = results['distances'][0] if 'distances' in results and results['distances'] else [1.0]*len(ids)
            
            for idx in range(len(ids)):
                formatted_results.append({
                    "id": ids[idx],
                    "metadata": metadatas[idx],
                    "document": documents[idx],
                    "score": round(1.0 - distances[idx], 4)
                })
        return formatted_results

    def delete_item(self, item_id: str):
        self.collection.delete(ids=[item_id])
        print(f"ChromaDB: Deleted item {item_id}")

vector_db = None

def get_vector_db():
    global vector_db
    if vector_db is None:
        vector_db = VectorDB()
    return vector_db

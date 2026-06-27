import os
import io
os.environ.setdefault("TMPDIR", "/tmp")

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import chromadb
from sentence_transformers import SentenceTransformer
from groq import Groq
import pypdf
import tiktoken

app = FastAPI(title="Chat With Your Docs")

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

#Initialize clients 
groq_client   = Groq(api_key=os.environ.get("GROQ_API_KEY"))
embed_model   = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
chroma_client = chromadb.Client()
tokenizer     = tiktoken.get_encoding("cl100k_base")

collection = None


def extract_pdf_text(file_bytes: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text.strip()


def chunk_text(text: str, chunk_size=150, overlap=20):
    tokens = tokenizer.encode(text)
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk = tokenizer.decode(tokens[start:end])
        chunks.append(chunk.strip())
        start += chunk_size - overlap
    return [c for c in chunks if len(c) > 30]


@app.get("/health")
def health():
    return {
        "status": "ok",
        "document_loaded": collection is not None,
        "chunks": collection.count() if collection else 0,
    }


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    global collection

    if not file.filename.endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")

    contents = await file.read()
    text = extract_pdf_text(contents)
    if not text:
        raise HTTPException(400, "Could not extract text from this PDF")

    chunks = chunk_text(text)

    try:
        chroma_client.delete_collection("documents")
    except Exception:
        pass
    collection = chroma_client.create_collection("documents")

    embeddings = [embed_model.encode(chunk).tolist() for chunk in chunks]
    collection.add(
        documents=chunks,
        embeddings=embeddings,
        ids=[f"chunk_{i}" for i in range(len(chunks))],
        metadatas=[{"source": file.filename, "chunk_index": i} for i in range(len(chunks))],
    )

    return {
        "message": "Uploaded and indexed successfully!",
        "filename": file.filename,
        "chunks": len(chunks),
        "characters": len(text),
    }


class ChatRequest(BaseModel):
    question: str


@app.post("/chat")
async def chat(request: ChatRequest):
    global collection

    if collection is None:
        raise HTTPException(400, "No document uploaded yet. Please upload a PDF first.")

    # Retrieve top-5 chunks
    query_embedding = embed_model.encode(request.question).tolist()
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(5, collection.count()),
    )

    docs      = results["documents"][0]
    distances = results["distances"][0]

    # Relaxed threshold — use all retrieved chunks
    context = "\n\n".join(docs)

    prompt = f"""You are a strict document assistant.

RULES:
- Answer ONLY using the context provided below
- If the answer is not clearly in the context, say: "This information is not in the document."
- Do NOT use your own knowledge or make things up
- Be concise and factual

Context from document:
{context}

Question: {request.question}

Answer (strictly from context only):"""

    def generate():
        stream = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You are a strict document Q&A assistant. Only answer from the provided context. Never use outside knowledge."
                },
                {"role": "user", "content": prompt}
            ],
            max_tokens=400,
            temperature=0.1,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    return StreamingResponse(generate(), media_type="text/plain")

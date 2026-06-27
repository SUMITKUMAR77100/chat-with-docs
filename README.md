#  Chat With Your Docs
### — RAG + ChromaDB + Groq + React

Upload any PDF and chat with it using AI. Built with:
- **FastAPI** — Python backend
- **ChromaDB** — Vector database for storing embeddings
- **sentence-transformers** — Free local embeddings (all-MiniLM-L6-v2)
- **Groq + Llama 3.3 70B** — Free LLM for answer generation
- **React** — Chat frontend with streaming responses

---

##  Quick Start

### Step 1 — Get your free Groq API key
Go to  https://console.groq.com → Sign up → API Keys → Create key

---

### Step 2 — Setup Backend

Open a terminal in VS Code and run:

```bash
cd backend
python -m venv venv
```

**Activate virtual environment:**
```bash
# Windows
venv\Scripts\activate

# Mac / Linux
source venv/bin/activate
```

**Install dependencies:**
```bash
pip install -r requirements.txt
```

**Set your Groq API key:**
```bash
# Windows
set GROQ_API_KEY=your_key_here

# Mac / Linux
export GROQ_API_KEY=your_key_here
```

**Start the backend:**
```bash
uvicorn main:app --reload --port 8000
```

Backend running at: http://localhost:8000  
API docs at: http://localhost:8000/docs

---

### Step 3 — Setup Frontend

Open a **second terminal** in VS Code:

```bash
cd frontend
npm install
npm start
```

Frontend running at: http://localhost:3000

---

## How to Use

1. Open http://localhost:3000
2. Drag & drop any PDF onto the upload area
3. Wait for "Ready to chat!" confirmation
4. Type your question and press Enter
5. Get streaming AI answers based on your document!

---

## Project Structure

```
chat-with-docs/
├── backend/
│   ├── main.py              ← FastAPI app (upload + chat endpoints)
│   ├── requirements.txt     ← Python dependencies
│   └── .env.example         ← API key template
└── frontend/
    ├── src/
    │   ├── App.js           ← Main React component
    │   ├── App.css          ← Styling
    │   └── index.js         ← Entry point
    ├── public/
    │   └── index.html
    └── package.json
```

---

##  API Endpoints

| Method | Endpoint  | Description              |
|--------|-----------|--------------------------|
| GET    | /health   | Check server + doc status |
| POST   | /upload   | Upload and index a PDF   |
| POST   | /chat     | Ask a question (streams) |

---

##  How It Works (RAG Pipeline)

```
PDF Upload
    ↓
Extract text (pypdf)
    ↓
Chunk into ~150 token pieces (tiktoken)
    ↓
Embed each chunk (sentence-transformers)
    ↓
Store in ChromaDB with metadata
    ↓
User asks question
    ↓
Embed question → find top-5 similar chunks
    ↓
Send chunks + question to Groq (Llama 3.3 70B)
    ↓
Stream answer back to React frontend
```

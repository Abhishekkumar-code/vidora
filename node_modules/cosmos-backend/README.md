# O7 — RAG Video Intelligence
## Setup & Run Guide

---

## What's Built

| Layer | Tech | Purpose |
|---|---|---|
| **Backend** | Node.js + Express | REST API server |
| **AI Model** | Google Gemini 1.5 Flash | Summarisation and Q&A |
| **Embeddings** | Google text-embedding-004 | Vector embeddings |
| **Vector DB** | ChromaDB (collection: **O7**) | Chunk storage and retrieval |
| **RAG** | Custom RAG pipeline | Context-aware Q&A |
| **Transcript** | youtube-transcript | Fetch YouTube captions |
| **Frontend** | React + Vite | UI |

---

## Step-by-Step Setup

### 1. Install ChromaDB (Python — runs as a local server)
```bash
pip install chromadb
chroma run --port 8000
```
Keep this terminal running. ChromaDB listens at http://localhost:8000

---

### 2. Setup Backend
```bash
cd backend
npm install
```

Fill in your API key — open `backend/.env`:
```
GOOGLE_API_KEY=AIza...your_key_here
CHROMA_HOST=localhost
CHROMA_PORT=8000
PORT=5000
```

Get your free Gemini API key at: https://aistudio.google.com/app/apikey

Start the backend:
```bash
npm run dev
```
Backend runs at http://localhost:5000

---

### 3. Setup Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at http://localhost:3000

---

## API Keys Used

| API | Purpose | Cost |
|---|---|---|
| **Google Gemini 1.5 Flash** | Summarisation + Q&A answers | Free tier available |
| **Google text-embedding-004** | Creating vector embeddings | Free tier available |

Both use the **same GOOGLE_API_KEY** from Google AI Studio.

---

## Backend Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /health | Health check |
| POST | /api/process-video | Fetch transcript, store in O7, return summary |
| POST | /api/ask | RAG Q&A from O7 collection |
| GET | /api/stats | ChromaDB collection stats |
| GET | /api/video/:id | Check if video is already stored |

---

## How It Works

```
User pastes YouTube URL
        |
Backend fetches transcript (youtube-transcript)
        |
Text chunked (1500 chars, 200 overlap)
        |
Each chunk embedded via text-embedding-004
        |
Stored in ChromaDB collection "O7"
        |
Gemini 1.5 Flash generates 200-300 word summary
        |
User asks a question
        |
Question embedded -> top-5 chunks retrieved from O7
        |
Gemini 1.5 Flash answers with retrieved context (RAG)
```

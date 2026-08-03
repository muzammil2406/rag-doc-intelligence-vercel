# RAG Document Intelligence App

Upload a PDF and ask questions about it. AI answers strictly from the document — with page-number source citations and no hallucination.

**Live app:** https://rag-doc-intelligence-vercel.vercel.app

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| **Backend** | NestJS 10, TypeScript |
| **Database** | PostgreSQL (Neon serverless) + Prisma ORM |
| **Vector Store** | PostgreSQL itself — `Chunk` table (embeddings as JSON) + JS cosine similarity |
| **Embeddings** | Google Gemini `gemini-embedding-001` (3072-dim) via direct REST API |
| **Chat LLM** | Groq `llama-3.1-8b-instant` via direct REST API |
| **PDF Parsing** | `pdf-parse` with text sanitization |
| **Auth** | JWT + bcryptjs (email/password) |
| **File Upload** | Multer |
| **Hosting** | Frontend → Vercel · Backend → Render · DB → Neon |

> No LangChain / ML framework — embeddings and chat are direct API calls, retrieval is hand-written cosine similarity over PostgreSQL. Keeps the memory footprint small enough for Render's free tier.

## Features

- JWT authentication (register/login)
- PDF upload with drag and drop
- RAG pipeline — PDF parsed → split into chunks → embedded → stored in PostgreSQL
- Chat interface with source citations (page number + excerpt)
- Chat history saved in PostgreSQL
- Document delete (removes chunks + messages)

## Architecture

```
PDF Upload → pdf-parse → text sanitization → custom text splitter → Gemini embedding → PostgreSQL Chunks

Question → Gemini embedding → cosine similarity → top 5 chunks → Groq llama-3.1-8b-instant → Answer + sources
```

## Run Locally

### Prerequisites
- Node.js 18+
- A Neon (PostgreSQL) database
- A Google Gemini API key (`gemini-embedding-001` enabled)
- A Groq API key

### Backend

```bash
cd backend
npm install --legacy-peer-deps
npx prisma db push
npm run start:dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

Create `backend/.env`:

```env
DATABASE_URL=postgresql://...    # Neon connection string
JWT_SECRET=your-secret
GOOGLE_API_KEY=your-gemini-key
GROQ_API_KEY=your-groq-key
PORT=3001
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Deployed Configuration

- **Render (backend):** Root Directory `backend`, Build `npm install --legacy-peer-deps && npm run prisma:generate && npm run build`, Start `node dist/main`. Env vars: `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_API_KEY`, `GROQ_API_KEY`. Leave `PORT` unset (Render assigns it).
- **Vercel (frontend):** Root Directory `frontend`, Framework Preset Next.js. Env var `NEXT_PUBLIC_API_URL` = `https://<your-backend>.onrender.com`.

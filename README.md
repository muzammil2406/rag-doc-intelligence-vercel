# RAG Document Intelligence App

Upload a PDF and ask questions about it. AI answers strictly from the document — no hallucination.

## Tech Stack
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** NestJS, TypeScript
- **Database:** PostgreSQL (Neon.tech) + Prisma ORM
- **AI:** LangChain JS + Gemini 1.5 Flash + Gemini Embeddings
- **Vector DB:** Pinecone
- **Auth:** JWT + bcrypt

## Features
- JWT authentication (register/login)
- PDF upload with drag and drop
- RAG pipeline — PDF parsed, chunked, embedded, stored in Pinecone
- Chat interface with source citations (page number + excerpt)
- Chat history saved in PostgreSQL

## Run Locally

### Backend
```bash
cd backend
npm install
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
Create `backend/.env` — see `.env.example`

## Architecture
PDF Upload → LangChain PDFLoader → Chunking → Gemini Embeddings → Pinecone
Question → Embed → Pinecone similarity search → Top 5 chunks → Gemini Flash → Answer

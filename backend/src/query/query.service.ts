import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RagService } from '../rag/rag.service';

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  private readonly SYSTEM_PROMPT = `You are a precise document analysis assistant. You MUST answer questions ONLY using the provided document context below.

RULES:
1. Answer ONLY based on the provided context. If the context does not contain enough information to answer, say "I cannot answer this question based on the provided document."
2. NEVER make up or hallucinate information that is not in the context.
3. ALWAYS cite your sources by referencing the page number(s) where you found the information.
4. If the answer spans multiple chunks, synthesize them into a clear, coherent response.
5. Be concise but thorough.
6. If the user asks something completely unrelated to the document, politely explain you can only answer questions about the uploaded document.

FORMAT YOUR RESPONSE:
- Give a clear, direct answer
- After the answer, list your sources as: [Page X] "relevant excerpt..."

DOCUMENT CONTEXT:
`;

  constructor(
    private prisma: PrismaService,
    private ragService: RagService,
  ) {}

  private async callGroq(systemPrompt: string, userMessage: string): Promise<string> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error?.error?.message || `Groq API error: ${res.status}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  async queryDocument(
    question: string,
    documentId: string,
    userId: string,
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (document.status !== 'ready') {
      throw new BadRequestException(
        'Document is still processing or failed to process. Please wait and try again.',
      );
    }

    const relevantChunks = await this.ragService.queryDocument(
      question,
      documentId,
    );

    if (relevantChunks.length === 0) {
      const assistantMessage = await this.prisma.message.create({
        data: {
          documentId,
          role: 'assistant',
          content:
            'I could not find any relevant information in the document to answer your question.',
          sources: [],
        },
      });

      return {
        message: assistantMessage,
      };
    }

    const context = relevantChunks
      .map(
        (chunk, i) =>
          `[Chunk ${i + 1} | Page ${chunk.pageNumber}]\n${chunk.content}`,
      )
      .join('\n\n---\n\n');

    const prompt = `${this.SYSTEM_PROMPT}${context}`;

    const answer = await this.callGroq(prompt, question);

    const sources = relevantChunks.map((chunk) => ({
      pageNumber: chunk.pageNumber,
      excerpt: chunk.content.substring(0, 300),
      score: chunk.score,
    }));

    const userMessage = await this.prisma.message.create({
      data: {
        documentId,
        role: 'user',
        content: question,
      },
    });

    const assistantMessage = await this.prisma.message.create({
      data: {
        documentId,
        role: 'assistant',
        content: answer,
        sources,
      },
    });

    this.logger.log(
      `Query answered for document ${documentId}: "${question.substring(0, 50)}..."`,
    );

    return {
      userMessage,
      assistantMessage,
    };
  }

  async getChatHistory(documentId: string, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const messages = await this.prisma.message.findMany({
      where: { documentId },
      orderBy: { createdAt: 'asc' },
    });

    return messages;
  }
}

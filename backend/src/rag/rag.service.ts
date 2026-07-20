import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfParse from 'pdf-parse';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document as LangchainDocument } from '@langchain/core/documents';

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private embeddings: GoogleGenerativeAIEmbeddings;

  private readonly textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
    separators: ['\n\n', '\n', '. ', ' ', ''],
  });

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      modelName: 'gemini-embedding-001',
      apiKey: process.env.GOOGLE_API_KEY!,
    });
    this.logger.log('RAG service ready (PostgreSQL vector store)');
  }

  async processPdf(filePath: string, documentId: string): Promise<number> {
    this.logger.log(`Processing PDF: ${filePath} for document: ${documentId}`);

    const buffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(buffer);

    this.logger.log(`Parsed PDF: ${pdfData.numpages} pages, ${pdfData.text.length} chars`);

    const pageTexts = this.extractPageTexts(pdfData);

    const docs = pageTexts
      .filter((pt) => pt.text.trim().length >= 30)
      .map(
        (pt) =>
          new LangchainDocument({
            pageContent: pt.text.trim(),
            metadata: {
              documentId,
              pageNumber: pt.pageNumber,
              source: path.basename(filePath),
            },
          }),
      );

    this.logger.log(`Kept ${docs.length} pages with valid text`);

    if (docs.length === 0) {
      this.logger.warn('No valid text found in PDF — may be image-only');
      try { fs.unlinkSync(filePath); } catch {}
      return 0;
    }

    const chunks = await this.textSplitter.splitDocuments(docs);
    this.logger.log(`Split into ${chunks.length} chunks`);

    const texts = chunks.map((c) => c.pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);
    this.logger.log(`Generated ${embeddings.length} embeddings`);

    await this.prisma.chunk.createMany({
      data: chunks.map((chunk, i) => ({
        documentId,
        content: chunk.pageContent,
        embedding: embeddings[i],
        pageNumber:
          chunk.metadata.loc?.pageNumber ||
          chunk.metadata.page ||
          i + 1,
      })),
    });

    this.logger.log(`Stored ${chunks.length} chunks in PostgreSQL`);

    try {
      fs.unlinkSync(filePath);
      this.logger.log(`Cleaned up temp file: ${filePath}`);
    } catch {
      this.logger.warn(`Could not delete temp file: ${filePath}`);
    }

    return chunks.length;
  }

  async queryDocument(
    question: string,
    documentId: string,
  ): Promise<{ content: string; pageNumber: number; score: number }[]> {
    const questionEmbedding = await this.embeddings.embedQuery(question);

    const chunks = await this.prisma.chunk.findMany({
      where: { documentId },
    });

    if (chunks.length === 0) return [];

    const scored = chunks.map((chunk) => {
      const chunkEmbedding = chunk.embedding as number[];
      return {
        content: chunk.content,
        pageNumber: chunk.pageNumber,
        score: this.cosineSimilarity(questionEmbedding, chunkEmbedding),
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const top5 = scored.slice(0, 5);

    this.logger.log(
      `Found ${top5.length} similar chunks for document ${documentId} (best: ${top5[0]?.score.toFixed(4)})`,
    );

    return top5;
  }

  async deleteDocumentVectors(documentId: string): Promise<void> {
    await this.prisma.chunk.deleteMany({ where: { documentId } });
    this.logger.log(`Deleted chunks for document: ${documentId}`);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private extractPageTexts(pdfData: any): { pageNumber: number; text: string }[] {
    const fullText: string = pdfData.text || '';
    if (!fullText.trim()) return [];

    const pages: { pageNumber: number; text: string }[] = [];

    if (pdfData.numpages && pdfData.numpages > 1) {
      const splits = fullText.split(/\f/g);
      for (let i = 0; i < splits.length; i++) {
        const text = this.sanitizeText(splits[i]);
        if (text.trim().length > 0) {
          pages.push({ pageNumber: i + 1, text });
        }
      }
    }

    if (pages.length === 0 && fullText.trim()) {
      const chunkSize = 3000;
      const textChunks = fullText.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, 'g')) || [fullText];
      textChunks.forEach((chunk, i) => {
        const text = this.sanitizeText(chunk);
        if (text.trim().length > 0) {
          pages.push({ pageNumber: i + 1, text });
        }
      });
    }

    return pages;
  }

  private sanitizeText(text: string): string {
    return text
      .replace(/[^\x20-\x7E\n\r\t]/g, '')
      .replace(/\(image[^)]*\)/gi, '')
      .replace(/\[image[^\]]*\]/gi, '')
      .replace(/image\.png/gi, '')
      .replace(/\(figure[^)]*\)/gi, '')
      .replace(/\[figure[^\]]*\]/gi, '')
      .replace(/\(img[^)]*\)/gi, '')
      .replace(/\[img[^\]]*\]/gi, '')
      .replace(/\(png[^)]*\)/gi, '')
      .replace(/\[png[^\]]*\]/gi, '')
      .replace(/\(jpg[^)]*\)/gi, '')
      .replace(/\[jpg[^\]]*\]/gi, '')
      .replace(/\(jpeg[^)]*\)/gi, '')
      .replace(/\[jpeg[^\]]*\]/gi, '')
      .replace(/\(bitmap[^)]*\)/gi, '')
      .replace(/\[bitmap[^\]]*\]/gi, '')
      .replace(/\(photo[^)]*\)/gi, '')
      .replace(/\[photo[^\]]*\]/gi, '')
      .replace(/\(scan[^)]*\)/gi, '')
      .replace(/\[scan[^\]]*\]/gi, '')
      .replace(/data:image\/[^\s)]+/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

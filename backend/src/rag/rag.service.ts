import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfParse from 'pdf-parse';

interface TextChunk {
  pageContent: string;
  metadata: {
    documentId: string;
    pageNumber: number;
    source: string;
  };
}

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('RAG service ready (PostgreSQL vector store)');
  }

  private async embedTexts(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.GOOGLE_API_KEY!;
    const model = 'gemini-embedding-001';
    const batchSize = 100;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: batch.map((text) => ({
              model: `models/${model}`,
              content: { parts: [{ text }] },
            })),
          }),
        },
      );

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Gemini embeddings error: ${res.status} ${error}`);
      }

      const data = await res.json();
      const values = data.embeddings.map(
        (e: { values: number[] }) => e.values,
      );
      embeddings.push(...values);
    }

    return embeddings;
  }

  private async embedQuery(text: string): Promise<number[]> {
    const apiKey = process.env.GOOGLE_API_KEY!;
    const model = 'gemini-embedding-001';

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text }] },
        }),
      },
    );

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Gemini embedding error: ${res.status} ${error}`);
    }

    const data = await res.json();
    return data.embedding.values;
  }

  private splitText(
    text: string,
    chunkSize = 1000,
    chunkOverlap = 200,
    separators = ['\n\n', '\n', '. ', ' ', ''],
  ): string[] {
    const chunks: string[] = [];

    const recursive = (content: string): void => {
      if (content.length <= chunkSize) {
        if (content.trim()) chunks.push(content.trim());
        return;
      }

      let splitIndex = -1;
      let splitLen = -1;

      for (const sep of separators) {
        const idx = content.lastIndexOf(sep, chunkSize);
        if (idx > -1 && idx > splitIndex) {
          splitIndex = idx;
          splitLen = sep.length;
        }
      }

      if (splitIndex === -1) {
        splitIndex = chunkSize;
        splitLen = 0;
      }

      const part = content.substring(0, splitIndex);
      if (part.trim()) chunks.push(part.trim());

      const rest = content.substring(splitIndex + splitLen);
      if (rest.length > 0) recursive(rest);
    };

    recursive(text);
    return chunks;
  }

  async processPdf(filePath: string, documentId: string): Promise<number> {
    this.logger.log(
      `Processing PDF: ${filePath} for document: ${documentId}`,
    );

    const buffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(buffer);

    this.logger.log(
      `Parsed PDF: ${pdfData.numpages} pages, ${pdfData.text.length} chars`,
    );

    const pageTexts = this.extractPageTexts(pdfData);

    const docs: TextChunk[] = pageTexts
      .filter((pt) => pt.text.trim().length >= 30)
      .map((pt) => ({
        pageContent: pt.text.trim(),
        metadata: {
          documentId,
          pageNumber: pt.pageNumber,
          source: path.basename(filePath),
        },
      }));

    this.logger.log(`Kept ${docs.length} pages with valid text`);

    if (docs.length === 0) {
      this.logger.warn('No valid text found in PDF — may be image-only');
      try {
        fs.unlinkSync(filePath);
      } catch {}
      return 0;
    }

    const chunks: string[] = [];
    for (const doc of docs) {
      chunks.push(...this.splitText(doc.pageContent));
    }
    this.logger.log(`Split into ${chunks.length} chunks`);

    const embeddings = await this.embedTexts(chunks);
    this.logger.log(`Generated ${embeddings.length} embeddings`);

    let chunkIndex = 0;
    const rows = [];
    for (const doc of docs) {
      const docChunks = this.splitText(doc.pageContent);
      for (const chunkContent of docChunks) {
        rows.push({
          documentId,
          content: chunkContent,
          embedding: embeddings[chunkIndex],
          pageNumber: doc.metadata.pageNumber,
        });
        chunkIndex++;
      }
    }

    await this.prisma.chunk.createMany({ data: rows });
    this.logger.log(`Stored ${rows.length} chunks in PostgreSQL`);

    try {
      fs.unlinkSync(filePath);
      this.logger.log(`Cleaned up temp file: ${filePath}`);
    } catch {
      this.logger.warn(`Could not delete temp file: ${filePath}`);
    }

    return rows.length;
  }

  async queryDocument(
    question: string,
    documentId: string,
  ): Promise<{ content: string; pageNumber: number; score: number }[]> {
    const questionEmbedding = await this.embedQuery(question);

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

  private extractPageTexts(
    pdfData: any,
  ): { pageNumber: number; text: string }[] {
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
      const textChunks =
        fullText.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, 'g')) || [
          fullText,
        ];
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

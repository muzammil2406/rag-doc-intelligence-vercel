import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RagService } from '../rag/rag.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private ragService: RagService,
  ) {}

  async uploadPdf(
    file: Express.Multer.File,
    userId: string,
  ) {
    const document = await this.prisma.document.create({
      data: {
        filename: file.originalname,
        fileSize: file.size,
        status: 'processing',
        userId,
      },
    });

    this.logger.log(`Document created: ${document.id}, starting async processing`);

    this.ragService
      .processPdf(file.path, document.id)
      .then(async (chunkCount) => {
        await this.prisma.document.update({
          where: { id: document.id },
          data: { status: 'ready' },
        });
        this.logger.log(
          `Document ${document.id} processed: ${chunkCount} chunks embedded`,
        );
      })
      .catch(async (error) => {
        this.logger.error(`Failed to process document ${document.id}:`, error);
        await this.prisma.document.update({
          where: { id: document.id },
          data: { status: 'error' },
        });
      });

    return {
      id: document.id,
      filename: document.filename,
      fileSize: document.fileSize,
      status: document.status,
      createdAt: document.createdAt,
    };
  }

  async getDocuments(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        fileSize: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async getDocument(documentId: string, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return document;
  }

  async deleteDocument(documentId: string, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    await this.ragService.deleteDocumentVectors(documentId);

    await this.prisma.message.deleteMany({
      where: { documentId },
    });

    await this.prisma.document.delete({
      where: { id: documentId },
    });

    return { message: 'Document deleted successfully' };
  }
}

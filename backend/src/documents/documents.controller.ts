import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(
            new BadRequestException('Only PDF files are allowed'),
            false,
          );
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadPdf(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.documentsService.uploadPdf(file, req.user.userId);
  }

  @Get()
  getDocuments(@Request() req: any) {
    return this.documentsService.getDocuments(req.user.userId);
  }

  @Get(':id')
  getDocument(@Param('id') id: string, @Request() req: any) {
    return this.documentsService.getDocument(id, req.user.userId);
  }

  @Delete(':id')
  deleteDocument(@Param('id') id: string, @Request() req: any) {
    return this.documentsService.deleteDocument(id, req.user.userId);
  }
}

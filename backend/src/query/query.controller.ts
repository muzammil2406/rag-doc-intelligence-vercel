import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  Query as QueryParam,
} from '@nestjs/common';
import { QueryService } from './query.service';
import { QueryDto } from './dto/query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('query')
@UseGuards(JwtAuthGuard)
export class QueryController {
  constructor(private queryService: QueryService) {}

  @Post()
  queryDocument(@Body() dto: QueryDto, @Request() req: any) {
    return this.queryService.queryDocument(
      dto.question,
      dto.documentId,
      req.user.userId,
    );
  }

  @Get(':documentId/history')
  getChatHistory(
    @Param('documentId') documentId: string,
    @Request() req: any,
  ) {
    return this.queryService.getChatHistory(documentId, req.user.userId);
  }
}

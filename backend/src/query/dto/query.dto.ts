import { IsString } from 'class-validator';

export class QueryDto {
  @IsString()
  question: string;

  @IsString()
  documentId: string;
}

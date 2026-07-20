import { Module, Global } from '@nestjs/common';
import { RagService } from './rag.service';

@Global()
@Module({
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}

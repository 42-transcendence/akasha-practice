import { Module } from '@nestjs/common';
import { ChatPrismaService } from './chat-prisma.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ChatPrismaService],
  exports: [ChatPrismaService]
})
export class ChatPrismaModule { }

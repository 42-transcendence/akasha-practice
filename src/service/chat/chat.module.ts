import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatPrismaModule } from './chat-prisma/chat-prisma.module';

@Module({
	providers: [ChatGateway, ChatService],
	imports: [ChatPrismaModule],
	exports: [ChatGateway]
})
export class ChatModule { }

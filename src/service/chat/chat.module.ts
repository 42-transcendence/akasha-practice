import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatSocket } from './chat.socket';
import { ChatService } from './chat.service';

@Module({
	providers: [ChatGateway, ChatSocket, ChatService],
	imports: [],
	exports: [ChatGateway]
})
export class ChatModule { }

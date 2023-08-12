import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatSocket } from './chat.socket';
import { ChatService } from './chat.service';
import { AuthModule } from 'src/user/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
	providers: [ChatGateway, ChatSocket, ChatService],
	imports: [AuthModule, PrismaModule],
	exports: [ChatGateway]
})
export class ChatModule { }

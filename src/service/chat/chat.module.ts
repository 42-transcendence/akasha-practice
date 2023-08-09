import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { CommandModule } from './command/command.module';

@Module({
	providers: [ChatGateway],
	imports: [CommandModule],
	exports: [ChatGateway]
})
export class ChatModule { }

import { Module } from "@nestjs/common";
import { ChatGateway } from "./chat.gateway";
import { ChatServer } from "./chat.server";
import { ChatService } from "./chat.service";
import { AccountsModule } from "@/user/accounts/accounts.module";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule, AccountsModule],
  providers: [ChatGateway, ChatServer, ChatService],
  exports: [ChatServer],
})
export class ChatModule {}

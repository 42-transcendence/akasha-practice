import { Module } from "@nestjs/common";
import { ChatGateway } from "./chat.gateway";
import { ChatService } from "./chat.service";
import { AccountsModule } from "@/user/accounts/accounts.module";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule, AccountsModule],
  providers: [ChatGateway, ChatService],
})
export class ChatModule {}

import { Module } from "@nestjs/common";
import { GameGateway } from "./game.gateway";
import { GameService } from "./game.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { AccountsModule } from "@/user/accounts/accounts.module";
import { GameServer } from "./game.server";

@Module({
  imports: [PrismaModule, AccountsModule],
  providers: [GameGateway, GameServer, GameService],
  exports: [GameServer],
})
export class GameModule {}

import { Module, forwardRef } from "@nestjs/common";
import { UserModule } from "src/user/user.module";
import { ChatGateway } from "./chat/chat.gateway";
import { GameGateway } from "./game/game.gateway";

@Module({
  imports: [forwardRef(() => UserModule)],
  providers: [ChatGateway, GameGateway],
  exports: [ChatGateway, GameGateway],
})
export class ServiceModule {}

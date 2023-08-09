import { Module, forwardRef } from "@nestjs/common";
import { ChatGateway } from "./chat/chat.gateway";
import { GameGateway } from "./game/game.gateway";
import { UserModule } from "../user/user.module";
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [forwardRef(() => UserModule), ChatModule],
  providers: [ChatGateway, GameGateway],
  exports: [ChatGateway, GameGateway],
})
export class ServiceModule {}

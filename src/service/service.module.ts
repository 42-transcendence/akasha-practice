import { Module, forwardRef } from "@nestjs/common";
import { GameGateway } from "./game/game.gateway";
import { UserModule } from "../user/user.module";
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [forwardRef(() => UserModule), ChatModule],
  providers: [GameGateway],
  exports: [GameGateway],
})
export class ServiceModule { }

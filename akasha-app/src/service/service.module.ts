import { Module, forwardRef } from "@nestjs/common";
import { UserModule } from "@/user/user.module";
import { ChatModule } from "./chat/chat.module";
import { GameModule } from "./game/game.module";

@Module({
  imports: [forwardRef(() => UserModule), ChatModule, GameModule],
})
export class ServiceModule {}

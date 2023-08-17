import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { ConfigModule } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AccountsModule } from "@/user/accounts/accounts.module";
import { SessionsModule } from "@/user/sessions/sessions.module";

@Module({
  imports: [ConfigModule, AccountsModule, SessionsModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}

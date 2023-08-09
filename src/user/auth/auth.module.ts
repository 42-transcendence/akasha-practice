import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AccountsModule } from "../accounts/accounts.module";
import { SessionsModule } from "../sessions/sessions.module";

@Module({
  imports: [ConfigModule, PrismaModule, AccountsModule, SessionsModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService]
})
export class AuthModule { }

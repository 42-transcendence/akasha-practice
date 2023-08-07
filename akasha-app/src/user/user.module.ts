import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { AccountsModule } from "./accounts/accounts.module";
import { SessionsModule } from "./sessions/sessions.module";
import { ServiceModule } from "../service/service.module";

@Module({
  imports: [ServiceModule, AuthModule, AccountsModule, SessionsModule],
  exports: [AccountsModule, SessionsModule],
})
export class UserModule {}

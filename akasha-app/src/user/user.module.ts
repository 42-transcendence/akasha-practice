import { Module } from "@nestjs/common";
import { ServiceModule } from "src/service/service.module";
import { AuthModule } from "./auth/auth.module";
import { AccountsModule } from "./accounts/accounts.module";
import { SessionsModule } from "./sessions/sessions.module";

@Module({
  imports: [ServiceModule, AuthModule, AccountsModule, SessionsModule],
  exports: [AccountsModule, SessionsModule],
})
export class UserModule {}

import { Module } from "@nestjs/common";
import { ServiceModule } from "@/service/service.module";
import { AuthModule } from "./auth/auth.module";
import { AccountsModule } from "./accounts/accounts.module";
import { SessionsModule } from "./sessions/sessions.module";
import { ProfileModule } from "./profile/profile.module";

@Module({
  imports: [
    ServiceModule,
    AuthModule,
    AccountsModule,
    SessionsModule,
    ProfileModule,
  ],
  exports: [AccountsModule, SessionsModule],
})
export class UserModule {}

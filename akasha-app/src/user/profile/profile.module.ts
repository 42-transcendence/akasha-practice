import { Module } from "@nestjs/common";
import { AccountsModule } from "@/user/accounts/accounts.module";
import { AuthModule } from "@/user/auth/auth.module";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

@Module({
  imports: [AccountsModule, AuthModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}

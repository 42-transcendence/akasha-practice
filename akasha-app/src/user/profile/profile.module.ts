import { Module } from "@nestjs/common";
import { AccountsModule } from "@/user/accounts/accounts.module";
import { AuthModule } from "@/user/auth/auth.module";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";
import { ServiceModule } from "@/service/service.module";

@Module({
  imports: [ServiceModule, AccountsModule, AuthModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}

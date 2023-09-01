import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { InternalController } from "./internal.controller";
import { InternalService } from "./internal.service";
import { AccountsModule } from "@/user/accounts/accounts.module";

@Module({
  imports: [ConfigModule, AccountsModule],
  controllers: [InternalController],
  providers: [InternalService],
})
export class InternalModule {}

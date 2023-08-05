import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { UserModule } from "./user/user.module";
import { ServiceModule } from "./service/service.module";

@Module({
  imports: [ConfigModule.forRoot(), PrismaModule, UserModule, ServiceModule],
})
export class AppModule {}

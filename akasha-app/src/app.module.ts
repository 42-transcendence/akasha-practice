import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { envFilePath, load } from "./config-factory";
import { PrismaModule } from "./prisma/prisma.module";
import { UserModule } from "./user/user.module";
import { ServiceModule } from "./service/service.module";
import { InternalModule } from "./internal/internal.module";
import { ScheduleModule } from "@nestjs/schedule";

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath, load }),
    ScheduleModule.forRoot(),
    PrismaModule,
    UserModule,
    ServiceModule,
    InternalModule,
  ],
})
export class AppModule {}

import { HttpAdapterHost, NestFactory, Reflector } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import {
  ClassSerializerInterceptor,
  INestApplication,
  Logger,
  ShutdownSignal,
  ValidationPipe,
} from "@nestjs/common";
import { PrismaClientExceptionFilter } from "./prisma/prisma-client-exception.filter";
import { WsAdapter } from "./ws-adapter";
import { ConfigService } from "@nestjs/config";
import { patternToRegExp } from "akasha-lib";
import { AkashaGlobal } from "./global";

function configCors(app: INestApplication<any>) {
  const config = app.get(ConfigService);

  const corsConfig = config.get("cors");
  if (typeof corsConfig !== "object" || corsConfig === null) {
    Logger.log("CORS disabled");
    return;
  }

  const corsOrigin = config.get("cors.origin");
  let origin: RegExp | RegExp[];
  if (Array.isArray(corsOrigin)) {
    if (!corsOrigin.every((e) => typeof e === "string")) {
      throw new TypeError("Configured CORS origin is not an array of string");
    }
    origin = corsOrigin.map((e) => patternToRegExp(e));
  } else if (typeof corsOrigin === "string") {
    origin = patternToRegExp(corsOrigin);
  } else {
    throw new TypeError(
      "Configured CORS origin is neither a string nor an array of string.",
    );
  }

  const corsMethod = config.get("cors.method");
  let methods: string | string[];
  if (Array.isArray(corsMethod)) {
    if (!corsMethod.every((e) => typeof e === "string")) {
      throw new TypeError("Configured CORS methods is not an array of string");
    }
    methods = corsMethod;
  } else if (typeof corsMethod === "string") {
    methods = corsMethod;
  } else {
    throw new TypeError(
      "Configured CORS methods is neither a string nor an array of string.",
    );
  }

  app.enableCors({
    origin,
    methods,
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
    forceCloseConnections: true, //NOTE: 이 옵션이 없으면 애플리케이션이 종료되기 직전 정리 작업에서 모든 HTTP 연결이 닫힐때까지 기다렸다가 종료된다.
  });
  AkashaGlobal.setInstance(app);
  configCors(app);

  const { httpAdapter } = app.get(HttpAdapterHost);

  app.useBodyParser("json", { limit: "8kb" });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useGlobalFilters(new PrismaClientExceptionFilter(httpAdapter));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  app.useWebSocketAdapter(new WsAdapter(app));

  app.enableShutdownHooks([ShutdownSignal.SIGINT, ShutdownSignal.SIGTERM]);

  await app.listen(3001);
}
bootstrap();

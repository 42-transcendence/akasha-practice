import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { Request } from "express";
import { IncomingMessage } from "http";
import { HttpArgumentsHost } from "@nestjs/common/interfaces";
import { AuthLevel, AuthPayload } from "@common/auth-payloads";
import { Reflector } from "@nestjs/core";

@Injectable()
export class AuthGuard implements CanActivate {
  static AUTH_PAYLOAD_KEY = "_auth" as const;
  static AUTH_LEVEL_MIN_KEY = "auth_level_min" as const;

  static extractAuthPayload(req: Request): AuthPayload;
  static extractAuthPayload(req: IncomingMessage): AuthPayload;

  static extractAuthPayload(req: any): AuthPayload {
    return (req as Record<string, any>)[
      AuthGuard.AUTH_PAYLOAD_KEY
    ] as AuthPayload;
  }

  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authLevelMin =
      this.reflector.get<AuthLevel>(
        AuthGuard.AUTH_LEVEL_MIN_KEY,
        context.getHandler(),
      ) ?? AuthLevel.REGULAR;

    const http: HttpArgumentsHost = context.switchToHttp();
    const req = http.getRequest<Request>();
    const token: string | undefined = AuthGuard.extractTokenFromHeader(req);
    if (token === undefined) {
      throw new BadRequestException("Missing token");
    }

    const payload: AuthPayload = await this.authService.extractJWTPayload(
      token,
    );
    if (payload.auth_level < authLevelMin) {
      return false;
    }

    (req as Record<string, any>)[AuthGuard.AUTH_PAYLOAD_KEY] = payload;
    return true;
  }

  private static extractTokenFromHeader(req: Request): string | undefined {
    const [type, token] = req.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}

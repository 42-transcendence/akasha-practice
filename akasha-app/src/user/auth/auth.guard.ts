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
import { AuthLevel, AuthPayload } from "./auth-payload";
import { Reflector } from "@nestjs/core";
import { AUTH_LEVEL_MIN_KEY } from "./auth.decorator";

@Injectable()
export class AuthGuard implements CanActivate {
  static AUTH_PAYLOAD_KEY: string = "_auth";

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
      this.reflector.get<AuthLevel>(AUTH_LEVEL_MIN_KEY, context.getHandler()) ??
      AuthLevel.REGULAR;

    const http: HttpArgumentsHost = context.switchToHttp();
    const request: any = http.getRequest();
    const token: string | undefined = this.extractTokenFromHeader(request);
    if (token === undefined) {
      throw new BadRequestException("Missing token");
    }

    const payload: AuthPayload = await this.authService.extractJWTPayload(
      token,
    );
    if (payload.auth_level < authLevelMin) {
      return false;
    }

    request[AuthGuard.AUTH_PAYLOAD_KEY] = payload;
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}

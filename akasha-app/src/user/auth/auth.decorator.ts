import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import { AuthLevel, AuthPayload } from "@common/auth-payloads";
import { Request } from "express";
import { AuthGuard } from "./auth.guard";

export const Auth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth: AuthPayload = AuthGuard.extractAuthPayload(req);
    return auth;
  },
);

export const AuthSkip = () => SetMetadata(AuthGuard.AUTH_SKIP_KEY, true);

export const AuthLevelMin = (level: AuthLevel) =>
  SetMetadata(AuthGuard.AUTH_LEVEL_MIN_KEY, level);

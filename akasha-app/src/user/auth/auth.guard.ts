import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthPayload, AuthService } from "./auth.service";
import { Request } from "express";
import { HttpArgumentsHost } from "@nestjs/common/interfaces";

@Injectable()
export class AuthGuard implements CanActivate {
  static AUTH_PAYLOAD_KEY: string = "_auth";

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http: HttpArgumentsHost = context.switchToHttp();
    const request: any = http.getRequest();
    const token: string | undefined = this.extractTokenFromHeader(request);
    if (token === undefined) {
      return false;
    }

    const payload: AuthPayload = await this.authService.extractJWTPayload(
      token,
    );
    request[AuthGuard.AUTH_PAYLOAD_KEY] = payload;
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}

import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { InternalService } from "./internal.service";
import { HttpArgumentsHost } from "@nestjs/common/interfaces";

@Injectable()
export class InternalGuard implements CanActivate {
  constructor(private readonly service: InternalService) {}

  canActivate(context: ExecutionContext): boolean {
    const http: HttpArgumentsHost = context.switchToHttp();
    const req = http.getRequest<Request>();
    const token: string | null = InternalGuard.extractTokenFromURL(req);
    return token === this.service.token;
  }

  private static extractTokenFromURL(req: Request): string | null {
    const url = new URL(req.url, "p://h");
    return url.searchParams.get("a");
  }
}

import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthPayload, AuthService, TokenSet } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { Request } from "express";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("begin")
  async beginAuth(
    @Query("endpoint_key") endpointKey: string | undefined,
    @Query("redirect_uri") redirectURI: string | undefined,
  ): Promise<string> {
    if (endpointKey === undefined || redirectURI === undefined) {
      throw new BadRequestException("Invalid query parameter");
    }
    if (!this.authService.isValidRedirectURI(redirectURI)) {
      throw new BadRequestException("Invalid redirect URI");
    }
    return await this.authService.beginAuthURL(endpointKey, redirectURI);
  }

  @Get("end")
  async endAuth(@Query() query: Record<string, string>): Promise<TokenSet> {
    return await this.authService.endAuthURL(query);
  }

  @Get("refresh")
  async refreshAuth(
    @Query("refresh_token") refreshToken: string | undefined,
  ): Promise<TokenSet> {
    if (refreshToken === undefined) {
      throw new BadRequestException("Invalid query parameter");
    }
    return await this.authService.refreshAuth(refreshToken);
  }

  @Get("test")
  @UseGuards(AuthGuard)
  test(@Req() req: Request) {
    const auth: any = (req as Record<string, any>)["auth"] as AuthPayload;
    console.log(auth);
  }
}

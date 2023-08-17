import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { Request } from "express";
import { AuthLevel, AuthPayload, TokenSet } from "./auth-payload";
import { AuthLevelMin } from "./auth.decorator";

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

  @Get("promotion")
  @AuthLevelMin(AuthLevel.TEMPORARY)
  @UseGuards(AuthGuard)
  async promotion(
    @Req() req: Request,
    @Query() query: Record<string, string>,
  ): Promise<TokenSet> {
    const auth: AuthPayload = AuthGuard.getAuthPayloadFromRequest(req);
    return await this.authService.promotionAuth(auth, query);
  }
}

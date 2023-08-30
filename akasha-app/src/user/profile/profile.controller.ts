import { Request } from "express";
import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { encodeBase32, generateHMACKey } from "akasha-lib";
import { AuthPayload } from "@common/auth-payloads";
import { AuthGuard } from "@/user/auth/auth.guard";
import { ProfileService } from "./profile.service";
import {
  AccountProfilePrivatePayload,
  AccountProfileProtectedPayload,
  AccountProfilePublicPayload,
} from "@common/profile-payloads";
import { AccountNickNameAndTag } from "@/user/accounts/accounts.service";

@Controller("profile")
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get("public/:uuid")
  async getPublicProfile(
    @Req() req: Request,
    @Param("uuid") uuid: string,
  ): Promise<AccountProfilePublicPayload> {
    const auth: AuthPayload = AuthGuard.extractAuthPayload(req);
    return await this.profileService.getPublicProfile(auth, uuid);
  }

  @Get("protected/:uuid")
  async getProtectedProfile(
    @Req() req: Request,
    @Param("uuid") uuid: string,
  ): Promise<AccountProfileProtectedPayload> {
    const auth: AuthPayload = AuthGuard.extractAuthPayload(req);
    return await this.profileService.getProtectedProfile(auth, uuid);
  }

  @Get("private")
  async getPrivateProfile(
    @Req() req: Request,
  ): Promise<AccountProfilePrivatePayload> {
    const auth: AuthPayload = AuthGuard.extractAuthPayload(req);
    return await this.profileService.getPrivateProfile(auth);
  }

  @Get("register")
  async register(
    @Req() req: Request,
    @Query("name") name: string,
  ): Promise<AccountNickNameAndTag> {
    const auth: AuthPayload = AuthGuard.extractAuthPayload(req);
    return this.profileService.setNick(auth, name);
  }

  @Get("setup-otp")
  async setupOTP(): Promise<{
    algorithm: string;
    key: string;
    digits: number;
    period: number;
  }> {
    const algorithm = "SHA-256";
    const key: Uint8Array = await generateHMACKey(algorithm);
    const digits = 6;
    const period = 30;

    return { algorithm, key: encodeBase32(key), digits, period };
  }
}

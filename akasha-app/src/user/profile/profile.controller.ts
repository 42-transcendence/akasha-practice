import { Request } from "express";
import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { encodeBase32, generateHMACKey } from "akasha-lib";
import { AuthPayload } from "@/user/auth/auth-payloads";
import { AuthGuard } from "@/user/auth/auth.guard";
import { ProfileService } from "./profile.service";
import { AccountProfilePublicModel } from "./profile-payloads";

@Controller("profile")
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get("public")
  async me(
    @Req() req: Request,
    @Query("uuid") uuid: string,
  ): Promise<AccountProfilePublicModel> {
    const auth: AuthPayload = AuthGuard.extractAuthPayload(req);
    return await this.profileService.getPublic(auth, uuid);
  }

  @Get("otp")
  async otp(): Promise<{
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

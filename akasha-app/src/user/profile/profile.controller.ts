import { Request } from "express";
import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { encodeBase32, generateHMACKey } from "akasha-lib";
import { AuthPayload } from "@/user/auth/auth-payload";
import { AuthGuard } from "@/user/auth/auth.guard";
import { ProfileService } from "./profile.service";
import { AccountWithRecord } from "@/user/accounts/accounts.service";

@Controller("profile")
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get("me")
  async me(@Req() req: Request): Promise<AccountWithRecord> {
    const auth: AuthPayload = AuthGuard.getAuthPayloadFromRequest(req);
    return await this.profileService.getMyRecord(auth);
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

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { encodeBase32, generateHMACKey } from "akasha-lib";
import { AuthPayload } from "@common/auth-payloads";
import { AuthGuard } from "@/user/auth/auth.guard";
import { Auth, AuthSkip } from "@/user/auth/auth.decorator";
import { ProfileService } from "./profile.service";
import {
  AccountProfilePrivatePayload,
  AccountProfileProtectedPayload,
  AccountProfilePublicPayload,
} from "@common/profile-payloads";
import { AccountNickNameAndTag } from "@/user/accounts/accounts.service";
import { NickNameModel } from "./profile-model";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  AVATAR_FORM_DATA_KEY,
  AVATAR_LIMIT,
  AVATAR_MIME_REGEX,
  AVATAR_MIME_TYPE,
} from "@common/profile-constants";

@Controller("profile")
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get("public/:uuid")
  async getPublicProfile(
    @Auth() auth: AuthPayload,
    @Param("uuid") uuid: string,
  ): Promise<AccountProfilePublicPayload> {
    return await this.profileService.getPublicProfile(auth, uuid);
  }

  @Get("protected/:uuid")
  async getProtectedProfile(
    @Auth() auth: AuthPayload,
    @Param("uuid") uuid: string,
  ): Promise<AccountProfileProtectedPayload> {
    return await this.profileService.getProtectedProfile(auth, uuid);
  }

  @Get("private")
  async getPrivateProfile(
    @Auth() auth: AuthPayload,
  ): Promise<AccountProfilePrivatePayload> {
    return await this.profileService.getPrivateProfile(auth);
  }

  @Post("nick")
  async addNick(
    @Auth() auth: AuthPayload,
    @Body() body: NickNameModel,
  ): Promise<AccountNickNameAndTag> {
    return this.profileService.registerNick(auth, body.name);
  }

  @Get("avatar")
  @Header("Content-Type", AVATAR_MIME_TYPE)
  @Header("Content-Disposition", "inline")
  //TODO: Cache-Control
  async getSelfAvatar(@Auth() auth: AuthPayload) {
    const data = await this.profileService.getAvatarDataByUUID(auth, undefined);
    if (data === null) {
      return null;
    }

    return new StreamableFile(data);
  }

  @Get("avatar/:uuid")
  @Header("Content-Type", AVATAR_MIME_TYPE)
  @Header("Content-Disposition", "inline")
  //TODO: Cache-Control
  async getAvatar(@Auth() auth: AuthPayload, @Param("uuid") uuid: string) {
    const data = await this.profileService.getAvatarDataByUUID(auth, uuid);
    if (data === null) {
      return null;
    }

    return new StreamableFile(data);
  }

  @AuthSkip()
  @Get("raw-avatar/:key")
  @Header("Content-Type", AVATAR_MIME_TYPE)
  @Header("Content-Disposition", "inline")
  //TODO: Cache-Control
  async getAvatarByKey(@Param("key") key: string) {
    const data = await this.profileService.getAvatarData(key);
    return new StreamableFile(data);
  }

  @Post("avatar")
  @UseInterceptors(FileInterceptor(AVATAR_FORM_DATA_KEY))
  async addAvatar(
    @Auth() auth: AuthPayload,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: AVATAR_MIME_REGEX,
        })
        .addMaxSizeValidator({
          maxSize: AVATAR_LIMIT,
        })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
  ) {
    return this.profileService.updateAvatar(auth, file.buffer);
  }

  @Delete("avatar")
  async removeAvatar(@Auth() auth: AuthPayload) {
    return this.profileService.updateAvatar(auth, null);
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

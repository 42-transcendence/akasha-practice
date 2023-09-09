import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  ParseFilePipeBuilder,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthPayload, OTPSecret } from "@common/auth-payloads";
import { AuthGuard } from "@/user/auth/auth.guard";
import { Auth } from "@/user/auth/auth.decorator";
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
} from "@common/profile-constants";
import { NickNamePipe } from "./profile.pipe";

@Controller("profile")
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get("public/:targetId")
  async getPublicProfile(
    @Param("targetId", ParseUUIDPipe) targetId: string,
  ): Promise<AccountProfilePublicPayload> {
    return await this.profileService.getPublicProfile(targetId);
  }

  @Get("protected/:targetId")
  async getProtectedProfile(
    @Auth() auth: AuthPayload,
    @Param("targetId", ParseUUIDPipe) targetId: string,
  ): Promise<AccountProfileProtectedPayload> {
    return await this.profileService.getProtectedProfile(auth, targetId);
  }

  @Get("private")
  async getPrivateProfile(
    @Auth() auth: AuthPayload,
  ): Promise<AccountProfilePrivatePayload> {
    return await this.profileService.getPrivateProfile(auth);
  }

  @Get("check-nick")
  async checkNick(@Body() body: NickNameModel): Promise<boolean> {
    return await this.profileService.checkNick(body.name);
  }

  @Post("nick")
  async addNick(
    @Auth() auth: AuthPayload,
    @Body() body: NickNameModel,
  ): Promise<AccountNickNameAndTag> {
    return await this.profileService.registerNick(auth, body.name);
  }

  @Get("lookup")
  async lookup(
    @Query("name", NickNamePipe) name: string,
    @Query("tag", ParseIntPipe) tag: number,
  ): Promise<string> {
    const id: string | null = await this.profileService.lookupIdByNick(
      name,
      tag,
    );
    if (id === null) {
      throw new NotFoundException();
    }
    return id;
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
  ): Promise<string | null> {
    return await this.profileService.updateAvatar(auth, file.buffer);
  }

  @Delete("avatar")
  async removeAvatar(@Auth() auth: AuthPayload): Promise<string | null> {
    return await this.profileService.updateAvatar(auth, null);
  }

  @Get("otp")
  async getInertOTP(@Auth() auth: AuthPayload): Promise<OTPSecret> {
    return await this.profileService.getInertOTP(auth);
  }

  @Post("otp")
  async enableOTP(
    @Auth() auth: AuthPayload,
    @Query("otp") clientOTP: string | undefined,
  ): Promise<void> {
    if (clientOTP === undefined) {
      throw new BadRequestException("Undefined OTP");
    }
    return await this.profileService.enableOTP(auth, clientOTP);
  }

  @Delete("otp")
  async disableOTP(
    @Auth() auth: AuthPayload,
    @Query("otp") clientOTP: string | undefined,
  ): Promise<void> {
    if (clientOTP === undefined) {
      throw new BadRequestException("Undefined OTP");
    }
    return await this.profileService.disableOTP(auth, clientOTP);
  }
}

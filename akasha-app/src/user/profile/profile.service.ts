import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AccountNickNameAndTag,
  AccountPrivate,
  AccountProtected,
  AccountPublic,
  AccountsService,
} from "@/user/accounts/accounts.service";
import { AuthLevel, AuthPayload } from "@common/auth-payloads";
import { getActiveStatusNumber } from "@common/generated/types";
import {
  AccountProfilePrivatePayload,
  AccountProfileProtectedPayload,
  AccountProfilePublicPayload,
} from "@common/profile-payloads";
import { NICK_NAME_REGEX } from "@common/profile-constants";

@Injectable()
export class ProfileService {
  constructor(private readonly accounts: AccountsService) {}

  async getPublicProfile(
    payload: AuthPayload,
    targetUUID: string,
  ): Promise<AccountProfilePublicPayload> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      if (!(await this.accounts.isExistsAccountByUUID(payload.user_id))) {
        throw new UnauthorizedException();
      }

      const targetAccount: AccountPublic | null =
        await this.accounts.findAccountPublicByUUID(targetUUID);
      if (targetAccount === null) {
        throw new NotFoundException();
      }

      return { ...targetAccount };
    }
    throw new ForbiddenException();
  }

  async getProtectedProfile(
    payload: AuthPayload,
    targetUUID: string,
  ): Promise<AccountProfileProtectedPayload> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      if (!(await this.accounts.isExistsAccountByUUID(payload.user_id))) {
        throw new UnauthorizedException();
      }
      //FIXME: 친구인지, 블랙인지 검사

      const targetAccount: AccountProtected | null =
        await this.accounts.findAccountProtectedByUUID(targetUUID);
      if (targetAccount === null) {
        throw new NotFoundException();
      }

      return {
        ...targetAccount,
        activeStatus: getActiveStatusNumber(targetAccount.activeStatus),
      };
    }
    throw new ForbiddenException();
  }

  async getPrivateProfile(
    payload: AuthPayload,
  ): Promise<AccountProfilePrivatePayload> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      const targetAccount: AccountPrivate | null =
        await this.accounts.findAccountPrivateByUUID(payload.user_id);
      if (targetAccount === null) {
        throw new NotFoundException();
      }

      return {
        ...targetAccount,
        activeStatus: getActiveStatusNumber(targetAccount.activeStatus),
      };
    }
    throw new ForbiddenException();
  }

  async registerNick(
    payload: AuthPayload,
    name: string,
  ): Promise<AccountNickNameAndTag> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      if (!NICK_NAME_REGEX.test(name)) {
        throw new BadRequestException();
      }

      const prevNickNameTag: AccountNickNameAndTag | null =
        await this.accounts.findNickByUUID(payload.user_id);
      if (prevNickNameTag === null) {
        throw new NotFoundException();
      }

      if (prevNickNameTag.nickName !== null) {
        throw new BadRequestException("Duplicate register");
      }

      const nickNameTag: AccountNickNameAndTag | undefined =
        await this.accounts.updateNickByUUID(payload.user_id, name);

      if (nickNameTag === undefined) {
        throw new ConflictException("Depleted nickName");
      }

      return nickNameTag;
    }
    throw new ForbiddenException();
  }
}

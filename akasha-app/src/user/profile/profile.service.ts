import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
      const accountId = await this.accounts.findAccountIdByUUIDOrThrow(
        payload.user_id,
      );
      //FIXME: 친구인지, 블랙인지 검사
      void accountId;

      const targetAccount: AccountProtected | null =
        await this.accounts.findAccountProtectedByUUID(targetUUID);
      if (targetAccount === null) {
        throw new NotFoundException();
      }

      //FIXME: activeStatus 변조

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

      return await this.accounts.updateNickByUUIDAtomic(
        payload.user_id,
        name,
        undefined,
        false,
      );
    }
    throw new ForbiddenException();
  }

  async updateAvatar(
    payload: AuthPayload,
    avatarData: Buffer | null,
  ): Promise<string | null> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      const key = await this.accounts.updateAvatarByUUIDAtomic(
        payload.user_id,
        avatarData,
      );
      return key;
    }
    throw new ForbiddenException();
  }
}

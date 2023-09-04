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
import {
  ActiveStatusNumber,
  getActiveStatusNumber,
} from "@common/generated/types";
import {
  AccountProfilePrivatePayload,
  AccountProfileProtectedPayload,
  AccountProfilePublicPayload,
} from "@common/profile-payloads";
import { NICK_NAME_REGEX } from "@common/profile-constants";
import { ChatServer } from "@/service/chat/chat.server";

@Injectable()
export class ProfileService {
  constructor(
    private readonly accounts: AccountsService,
    private readonly chatServer: ChatServer,
  ) {}

  async getPublicProfile(
    payload: AuthPayload,
    targetAccountId: string,
  ): Promise<AccountProfilePublicPayload> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      const targetAccount: AccountPublic | null =
        await this.accounts.findAccountPublic(targetAccountId);
      if (targetAccount === null) {
        throw new NotFoundException();
      }

      return { ...targetAccount };
    }
    throw new ForbiddenException();
  }

  async getProtectedProfile(
    payload: AuthPayload,
    targetAccountId: string,
  ): Promise<AccountProfileProtectedPayload> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      if (payload.user_id === targetAccountId) {
        return this.getPrivateProfile(payload);
      }

      const activeFlags = await this.accounts.findFriendActiveFlags(
        payload.user_id,
        targetAccountId,
      );

      if (activeFlags === null) {
        throw new ForbiddenException("Not duplex friend");
      }

      const targetAccount: AccountProtected | null =
        await this.accounts.findAccountProtected(targetAccountId);
      if (targetAccount === null) {
        throw new NotFoundException();
      }

      //FIXME: flags를 enum으로

      let activeStatus: ActiveStatusNumber;
      if ((activeFlags & 1) !== 0) {
        activeStatus = await this.getActiveStatus(targetAccountId);
      } else {
        // Blind activeStatus
        activeStatus = ActiveStatusNumber.OFFLINE;
      }

      let activeTimestamp: Date;
      if ((activeFlags & 2) !== 0) {
        activeTimestamp = targetAccount.activeTimestamp;
      } else {
        // Blind activeTimestamp
        activeTimestamp = new Date(0);
      }

      return {
        ...targetAccount,
        activeStatus,
        activeTimestamp,
      };
    }
    throw new ForbiddenException();
  }

  async getPrivateProfile(
    payload: AuthPayload,
  ): Promise<AccountProfilePrivatePayload> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      const targetAccount: AccountPrivate | null =
        await this.accounts.findAccountPrivate(payload.user_id);
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

  async getActiveStatus(targetAccountId: string): Promise<ActiveStatusNumber> {
    const activeStatus = await this.accounts.findActiveStatus(targetAccountId);
    if (activeStatus === null) {
      throw new NotFoundException();
    }

    const manualActiveStatus = getActiveStatusNumber(activeStatus);
    if (manualActiveStatus === ActiveStatusNumber.INVISIBLE) {
      return ActiveStatusNumber.OFFLINE;
    }

    // // ActiveStatusNumber.GAME ||| ActiveStatusNumber.MATCHING
    // const gameActiveStatus = await LocalServer.Games.getActiveStatus(targetAccountId);
    // if (gameActiveStatus !== undefined) {
    //   return gameActiveStatus;
    // }

    // // ActiveStatusNumber.ONLINE ||| ActiveStatusNumber.IDLE ||| ActiveStatusNumber.OFFLINE
    // const chatActiveStatus = await LocalServer.Chats.getActiveStatus(targetAccountId);
    const chatActiveStatus =
      await this.chatServer.getActiveStatus(targetAccountId);
    if (
      chatActiveStatus !== ActiveStatusNumber.OFFLINE &&
      manualActiveStatus !== ActiveStatusNumber.ONLINE
    ) {
      return manualActiveStatus;
    }

    return chatActiveStatus;
  }

  async registerNick(
    payload: AuthPayload,
    name: string,
  ): Promise<AccountNickNameAndTag> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      if (!NICK_NAME_REGEX.test(name)) {
        throw new BadRequestException();
      }

      return await this.accounts.updateNickAtomic(
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
      const key = await this.accounts.updateAvatarAtomic(
        payload.user_id,
        avatarData,
      );
      return key;
    }
    throw new ForbiddenException();
  }
}

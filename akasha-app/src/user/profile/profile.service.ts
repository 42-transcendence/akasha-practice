import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { AccountsService } from "@/user/accounts/accounts.service";
import { AuthLevel, AuthPayload } from "@/user/auth/auth-payloads";
import { Account } from "@prisma/client";
import {
  AccountProfilePrivateModel,
  AccountProfileProtectedModel,
  AccountProfilePublicModel,
} from "./profile-payloads";
import { getActiveStatusNumber } from "@/generated/types";

@Injectable()
export class ProfileService {
  constructor(private readonly accounts: AccountsService) {}

  async getPublicProfile(
    payload: AuthPayload,
    targetUUID: string,
  ): Promise<AccountProfilePublicModel> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      const account: Account | null = await this.accounts.findAccountByUUID(
        payload.user_id,
      );
      if (account === null) {
        throw new UnauthorizedException();
      }

      const targetAccount: Account | null =
        await this.accounts.findAccountByUUID(targetUUID);
      if (targetAccount === null) {
        throw new NotFoundException();
      }

      return new AccountProfilePublicModel(targetAccount);
    }
    throw new ForbiddenException();
  }

  async getProtectedProfile(
    payload: AuthPayload,
    targetUUID: string,
  ): Promise<AccountProfileProtectedModel> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      const account: Account | null = await this.accounts.findAccountByUUID(
        payload.user_id,
      );
      if (account === null) {
        throw new UnauthorizedException();
      }
      //FIXME: 친구인지, 블랙인지 검사

      const targetAccount: Account | null =
        await this.accounts.findAccountByUUID(targetUUID);
      if (targetAccount === null) {
        throw new NotFoundException();
      }

      return new AccountProfileProtectedModel({
        ...targetAccount,
        activeStatus: getActiveStatusNumber(targetAccount.activeStatus),
      });
    }
    throw new ForbiddenException();
  }

  async getPrivateProfile(
    payload: AuthPayload,
  ): Promise<AccountProfilePrivateModel> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      const account: Account | null = await this.accounts.findAccountByUUID(
        payload.user_id,
      );
      if (account === null) {
        throw new UnauthorizedException();
      }

      return new AccountProfilePrivateModel({
        ...account,
        activeStatus: getActiveStatusNumber(account.activeStatus),
      });
    }
    throw new ForbiddenException();
  }
}

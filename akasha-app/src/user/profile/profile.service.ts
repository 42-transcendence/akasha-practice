import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { AccountsService } from "@/user/accounts/accounts.service";
import { AuthLevel, AuthPayload } from "@/user/auth/auth-payloads";
import { Account } from "@prisma/client";
import { AccountProfilePublicModel } from "./profile-payloads";

@Injectable()
export class ProfileService {
  constructor(private readonly accounts: AccountsService) {}

  async getPublic(
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
}

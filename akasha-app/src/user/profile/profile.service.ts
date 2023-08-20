import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AccountsService } from "@/user/accounts/accounts.service";
import { AuthLevel, AuthPayload } from "@/user/auth/auth-payload";
import { Account } from "@prisma/client";

@Injectable()
export class ProfileService {
  constructor(private readonly accounts: AccountsService) {}

  async getMyRecord(payload: AuthPayload): Promise<Account> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      const account: Account | null = await this.accounts.findAccountByUUID(
        payload.user_id,
      );
      if (account === null) {
        throw new NotFoundException();
      }
      return account;
    }
    throw new ForbiddenException();
  }
}

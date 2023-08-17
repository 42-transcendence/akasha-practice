import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  AccountWithRecord,
  AccountsService,
} from "@/user/accounts/accounts.service";
import { AuthLevel, AuthPayload } from "@/user/auth/auth-payload";

@Injectable()
export class ProfileService {
  constructor(private readonly accounts: AccountsService) {}

  async getMyRecord(payload: AuthPayload): Promise<AccountWithRecord> {
    if (payload.auth_level === AuthLevel.COMPLETED) {
      return await this.accounts.getAccountWithRecordForUUID(payload.user_id);
    }
    throw new ForbiddenException();
  }
}

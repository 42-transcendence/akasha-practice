import {
  AccountWithRecord,
  AccountsService,
} from "@/user/accounts/accounts.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class ChatService {
  constructor(private readonly accounts: AccountsService) {}

  async loadInitializeData(accountUUID: string): Promise<AccountWithRecord> {
    return await this.accounts.getAccountWithRecordForUUID(accountUUID);
  }
}

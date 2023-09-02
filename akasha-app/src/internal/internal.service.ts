import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AccountsService } from "@/user/accounts/accounts.service";

@Injectable()
export class InternalService {
  readonly token: string;

  constructor(
    env: ConfigService,
    private readonly accounts: AccountsService,
  ) {
    this.token = env.getOrThrow("internal_token");
  }

  async getAvatarData(avatarKey: string): Promise<Buffer> {
    const data = await this.accounts.findAvatar(avatarKey);
    return data;
  }
}

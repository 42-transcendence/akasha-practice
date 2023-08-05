import { Injectable } from "@nestjs/common";
import { AccountsService } from "../accounts/accounts.service";
import { SessionsService } from "../sessions/sessions.service";

@Injectable()
export class AuthService {
  constructor(
    private accounts: AccountsService,
    private sessions: SessionsService,
  ) {}

  getHello(): string {
    void this.accounts, this.sessions;
    return "Hello World!";
  }
}

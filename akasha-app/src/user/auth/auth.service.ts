import { Injectable, Logger } from "@nestjs/common";
import { AccountsService } from "../accounts/accounts.service";
import { SessionsService } from "../sessions/sessions.service";
import { ConfigService } from "@nestjs/config";
import { AuthConfiguration } from "./config-auth";
import { plainToClass } from "class-transformer";
import { validateSync } from "class-validator";

@Injectable()
export class AuthService {
  protected readonly logger = new Logger(AuthService.name);
  private readonly authConfig: AuthConfiguration;

  constructor(
    private readonly config: ConfigService,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
  ) {
    const authConfig = plainToClass(AuthConfiguration, this.config.get("auth"));
    const validationErrrors = validateSync(authConfig);
    if (validationErrrors.length !== 0) {
      for (const validationError of validationErrrors) {
        this.logger.error(validationError.toString());
      }
      throw new Error("Validation error");
    }
    for (const sourceKey of authConfig.source.keys()) {
      this.logger.log(`[${sourceKey}] auth source loaded`);
    }
    this.authConfig = authConfig;
  }

  getHello(): string {
    void this.accounts, this.sessions;
    void this.authConfig;
    return "Hello World!";
  }
}

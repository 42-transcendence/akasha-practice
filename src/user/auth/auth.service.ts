import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { AccountsService } from "../accounts/accounts.service";
import {
  InvalidSessionError,
  ReuseDetectError,
  SessionsService,
} from "../sessions/sessions.service";
import { ConfigService } from "@nestjs/config";
import { AuthConfiguration, AuthSource } from "./config-auth";
import { instanceToPlain, plainToClass } from "class-transformer";
import {
  IsEnum,
  IsUUID,
  validateOrReject,
  validateSync,
} from "class-validator";
import {
  AuthorizationCodeRequest,
  OAuth,
  OAuthDefinedError,
  OAuthError,
  TokenSuccessfulResponse,
  UnknownOAuthError,
} from "@libs/oauth";
import { Account, Authorization, Role, Session } from "@prisma/client";
import * as jose from "jose";
import { jwtSignatureHMAC, jwtVerifyHMAC } from "@libs/jwt";

export const jwtAlgorithm = "HS256";

export class AuthPayload {
  @IsUUID() user_id: string;
  @IsEnum(Role) user_role: Role;

  constructor(user_id: string, user_role: Role) {
    this.user_id = user_id;
    this.user_role = user_role;
  }
}

export type TokenSet = {
  access_token: string;
  refresh_token: string;
};

@Injectable()
export class AuthService {
  protected readonly logger = new Logger(AuthService.name);
  readonly config: AuthConfiguration;

  constructor(
    env: ConfigService,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
  ) {
    const config = plainToClass(AuthConfiguration, env.get("auth"));
    const validationErrrors = validateSync(config, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (validationErrrors.length !== 0) {
      for (const validationError of validationErrrors) {
        this.logger.error(validationError.toString());
      }
      throw new Error("Validation error");
    }

    for (const [sourceKey, source] of config.source) {
      source._oauth = new OAuth(
        source.auth_url,
        source.token_url,
        source.client_id,
        source.client_secret,
      );
      this.logger.log(`[${sourceKey}] auth source loaded`);
    }
    if (config.jwt_secret.length < 32) {
      this.logger.warn(
        "Security threat: Authentication is vulnerable because JWT Secret is configured too short.",
      );
    }

    this.config = config;
  }

  private getAuthSource(sourceKey: string): AuthSource | undefined {
    return this.config.source.get(sourceKey);
  }

  isValidRedirectURI(redirectURI: string): boolean {
    return this.config.redirect_uri.some((e) => e.test(redirectURI));
  }

  async beginAuthURL(sourceKey: string, redirectURI: string): Promise<string> {
    const source: AuthSource | undefined = this.getAuthSource(sourceKey);
    if (source === undefined) {
      throw new BadRequestException("Undefined auth source");
    }

    const state: Authorization = await this.sessions.createNewTemporaryState({
      endpointKey: sourceKey,
      redirectURI: redirectURI,
    });

    const url: string = OAuth.beginAuthorizationCodeURL(
      source._oauth,
      state.redirectURI,
      source.scope,
      state.id,
    );

    return url;
  }

  async endAuthURL(query: Record<string, string>): Promise<TokenSet> {
    try {
      const authorizationCode = OAuth.endAuthorizationCodeURL(query);
      if (authorizationCode.state === undefined) {
        throw new BadRequestException("Invalid query parameter");
      }

      const state: Authorization | null =
        await this.sessions.findAndDeleteTemporaryState(
          authorizationCode.state,
        );
      if (state === null) {
        throw new BadRequestException("Not found state");
      }

      const source: AuthSource | undefined = this.getAuthSource(
        state.endpointKey,
      );
      if (source === undefined) {
        throw new BadRequestException("Undefined auth source");
      }

      const param: AuthorizationCodeRequest =
        OAuth.makeAuthorizationCodeRequest(
          source._oauth,
          authorizationCode,
          state.redirectURI,
        );
      const subject: string = await this.fetchSubject(source, param);

      const account: Account = await this.accounts.getOrCreateAccountForAuth({
        authIssuer: source.key,
        authSubject: subject,
      });
      const session: Session = await this.sessions.createNewSession(account.id);

      return await this.makeToken(account, session);
    } catch (e) {
      if (e instanceof UnknownOAuthError) {
        throw new BadRequestException("Invalid query parameter");
      }
      if (e instanceof OAuthDefinedError) {
        throw new BadRequestException(e);
      }
      throw e;
    }
  }

  async refreshAuth(refreshToken: string): Promise<TokenSet> {
    try {
      const session: Session | null = await this.sessions.refreshSession(
        refreshToken,
      );
      if (session === null) {
        throw new UnauthorizedException("Not found token");
      }

      const account: Account | null = await this.accounts.getAccount(
        session.accountId,
      );
      if (account === null) {
        this.sessions.invalidateSession(session.id);
        throw new ForbiddenException("Gone account");
      }

      return await this.makeToken(account, session);
    } catch (e) {
      if (e instanceof ReuseDetectError) {
        throw new ConflictException("Reuse detected");
      }
      if (e instanceof InvalidSessionError) {
        throw new UnauthorizedException("Invalid refresh token");
      }
      throw e;
    }
  }

  private async makeToken(
    account: Account,
    session: Session,
  ): Promise<TokenSet> {
    const payload = new AuthPayload(account.uuid, account.role);
    const payloadRaw: Record<string, unknown> = instanceToPlain(payload);

    const accessToken: string = await jwtSignatureHMAC(
      jwtAlgorithm,
      this.config.jwt_secret,
      payloadRaw,
      this.config.jwt_expire_secs,
      this.config.jwt_options,
    );
    const refreshToken: string = session.token;

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  private async fetchSubject(
    source: AuthSource,
    param: AuthorizationCodeRequest,
  ): Promise<string> {
    try {
      const token: TokenSuccessfulResponse = await OAuth.fetchToken(
        source._oauth,
        param,
      );

      return source.openid
        ? this.fetchSubject_OpenID(source, token)
        : this.fetchSubject_Manual(source, token);
    } catch (e) {
      if (e instanceof OAuthDefinedError) {
        throw new InternalServerErrorException(e);
      }
      if (e instanceof OAuthError) {
        throw new BadGatewayException(e);
      }
      throw e;
    }
  }

  private async fetchSubject_OpenID(
    source: AuthSource,
    token: TokenSuccessfulResponse,
  ) {
    if (!("id_token" in token && typeof token.id_token === "string")) {
      throw new InternalServerErrorException("Unsupported OpenID token");
    }
    const identity: string = token.id_token;

    if (source.jwks_url === undefined) {
      throw new InternalServerErrorException("Undefined JWKs");
    }
    const jwks = jose.createRemoteJWKSet(new URL(source.jwks_url));

    const { payload } = await jose.jwtVerify(identity, jwks);
    if (payload.sub === undefined) {
      throw new InternalServerErrorException("Undefined JWT subject");
    }

    const subject: string = payload.sub;
    return subject;
  }

  private async fetchSubject_Manual(
    source: AuthSource,
    token: TokenSuccessfulResponse,
  ) {
    if (source.subject_url === undefined || source.subject_key === undefined) {
      throw new InternalServerErrorException("Undefined subject metadata");
    }

    const subjectResponse: Response = await fetch(source.subject_url, {
      headers: { Authorization: ["Bearer", token.access_token].join(" ") },
    });
    if (!subjectResponse.ok) {
      throw new BadGatewayException("Bad subject server");
    }
    const subjectJSON = await subjectResponse.json();
    const subjectValue: unknown = subjectJSON[source.subject_key];
    if (subjectValue === undefined || subjectValue === null) {
      throw new InternalServerErrorException("Undefined subject value");
    }

    const subject: string = subjectValue.toString();
    return subject;
  }

  async extractJWTPayload(token: string): Promise<AuthPayload> {
    const verify = await jwtVerifyHMAC(
      token,
      jwtAlgorithm,
      this.config.jwt_secret,
      this.config.jwt_options,
    );

    if (!verify.success) {
      throw verify.expired
        ? new UnauthorizedException("Expired JWT")
        : new BadRequestException("Invalid JWT");
    }

    const payloadRaw: Record<string, unknown> = verify.payload;
    const payload = plainToClass(AuthPayload, payloadRaw);
    try {
      await validateOrReject(payload);
    } catch (e) {
      throw new InternalServerErrorException(e);
    }
    return payload;
  }
}

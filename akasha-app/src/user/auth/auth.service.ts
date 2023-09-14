import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AccountForAuth,
  AccountsService,
} from "@/user/accounts/accounts.service";
import {
  InvalidSessionError,
  ReuseDetectError,
  SessionsService,
} from "@/user/sessions/sessions.service";
import { ConfigService } from "@nestjs/config";
import { AuthConfiguration, AuthSource } from "./auth-config";
import {
  AuthorizationCodeRequest,
  OAuth,
  OAuthDefinedError,
  OAuthError,
  TokenSuccessfulResponse,
  UnknownOAuthError,
} from "akasha-lib";
import { Account, Authorization, Session } from "@prisma/client";
import * as jose from "jose";
import { jwtSignatureHMAC, jwtVerifyHMAC } from "akasha-lib";
import {
  AuthLevel,
  AuthPayload,
  TokenSet,
  isAuthPayload,
  isSecretParams,
} from "@common/auth-payloads";
import { getBanCategoryNumber, getRoleNumber } from "@common/generated/types";

@Injectable()
export class AuthService {
  protected static readonly logger = new Logger(AuthService.name);

  private readonly config: AuthConfiguration;

  constructor(
    env: ConfigService,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
  ) {
    const config = AuthConfiguration.load(env);

    for (const [sourceKey, source] of config.source) {
      source._oauth = new OAuth(
        source.auth_url,
        source.token_url,
        source.client_id,
        source.client_secret,
      );
      AuthService.logger.log(`[${sourceKey}] auth source loaded`);
    }
    if (config.jwt_secret.length < 32) {
      AuthService.logger.warn(
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
      source.oauth,
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

      const state: Authorization =
        await this.sessions.findAndDeleteTemporaryState(
          authorizationCode.state,
        );

      const source: AuthSource | undefined = this.getAuthSource(
        state.endpointKey,
      );
      if (source === undefined) {
        throw new BadRequestException("Undefined auth source");
      }

      const param: AuthorizationCodeRequest =
        OAuth.makeAuthorizationCodeRequest(
          source.oauth,
          authorizationCode,
          state.redirectURI,
        );
      const subject: string = await AuthService.fetchSubject(source, param);

      const account: AccountForAuth =
        await this.accounts.findOrCreateAccountForAuth(source.key, subject);

      if (account.otpSecret !== null) {
        const params = account.otpSecret.params;
        if (!isSecretParams(params)) {
          throw new InternalServerErrorException("Corrupted OTP param");
        }

        if (params.enabled) {
          return await this.makeTemporaryToken(account);
        }
      }

      if (account.bans.length !== 0) {
        return await this.makeBlockedToken(account);
      }

      const session: Session = await this.sessions.createNewSession(account.id);

      return await this.makeCompletedToken(account, session);
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
      const session: Session = await this.sessions.refreshSession(refreshToken);
      const account: AccountForAuth = await this.accounts.findAccountForAuth(
        session.accountId,
      );

      if (account.bans.length !== 0) {
        this.sessions.invalidateSession(session.id);
        return await this.makeBlockedToken(account);
      }

      return await this.makeCompletedToken(account, session);
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

  async promotionAuth(
    auth: AuthPayload,
    query: Record<string, string>,
  ): Promise<TokenSet> {
    if (auth.auth_level === AuthLevel.TEMPORARY) {
      const clientOTP: string = query["otp"];
      if (clientOTP === undefined) {
        throw new BadRequestException("Undefined OTP");
      }

      const state: Authorization =
        await this.sessions.findAndDeleteTemporaryState(auth.state);
      const account: AccountForAuth = await this.accounts.findAccountForAuth(
        state.redirectURI, //XXX: Hack
      );

      const secret = account.otpSecret;
      if (secret === null) {
        throw new InternalServerErrorException("Missing OTP data");
      }

      if (!(await this.accounts.checkOTP(secret, clientOTP))) {
        throw new UnauthorizedException("Wrong OTP");
      }

      if (account.bans.length !== 0) {
        return await this.makeBlockedToken(account);
      }

      const session: Session = await this.sessions.createNewSession(account.id);

      return await this.makeCompletedToken(account, session);
    }
    throw new BadRequestException("Invalid promotion request");
  }

  private async makeTemporaryToken(account: Account): Promise<TokenSet> {
    const state: Authorization = await this.sessions.createNewTemporaryState({
      //XXX: Hack: Temporary access token을 일회용으로 만들기 위하여 endpointKey에 빈 문자열을 사용하여 표시하고 활용했음.
      endpointKey: "",
      redirectURI: account.id,
    });

    const payload: AuthPayload = {
      auth_level: AuthLevel.TEMPORARY,
      state: state.id,
    };

    const accessToken: string = await jwtSignatureHMAC(
      AuthConfiguration.JWT_ALGORITHM,
      this.config.jwt_secret,
      payload,
      this.config.jwt_temp_expire_secs,
      this.config.jwt_options,
    );

    return { access_token: accessToken };
  }

  private async makeBlockedToken(account: AccountForAuth): Promise<TokenSet> {
    const payload: AuthPayload = {
      auth_level: AuthLevel.BLOCKED,
      user_id: account.id,
      bans: account.bans.map((e) => ({
        category: getBanCategoryNumber(e.category),
        reason: e.reason,
        expireTimestamp: e.expireTimestamp,
      })),
    };

    const accessToken: string = await jwtSignatureHMAC(
      AuthConfiguration.JWT_ALGORITHM,
      this.config.jwt_secret,
      payload,
      0,
      this.config.jwt_options,
    );

    return { access_token: accessToken };
  }

  private async makeCompletedToken(
    account: Account,
    session: Session,
  ): Promise<TokenSet> {
    const payload: AuthPayload = {
      auth_level: AuthLevel.COMPLETED,
      user_id: account.id,
      user_role: getRoleNumber(account.role),
    };

    const accessToken: string = await jwtSignatureHMAC(
      AuthConfiguration.JWT_ALGORITHM,
      this.config.jwt_secret,
      payload,
      this.config.jwt_expire_secs,
      this.config.jwt_options,
    );
    const refreshToken: string = session.token;

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  private static async fetchSubject(
    source: AuthSource,
    param: AuthorizationCodeRequest,
  ): Promise<string> {
    try {
      const token: TokenSuccessfulResponse = await OAuth.fetchToken(
        source.oauth,
        param,
      );

      return source.openid
        ? AuthService.fetchSubject_OpenID(source, token)
        : AuthService.fetchSubject_Manual(source, token);
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

  private static async fetchSubject_OpenID(
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

  private static async fetchSubject_Manual(
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
      AuthConfiguration.JWT_ALGORITHM,
      this.config.jwt_secret,
      this.config.jwt_options,
    );

    if (!verify.success) {
      throw new UnauthorizedException(
        verify.expired ? "Expired JWT" : "Invalid JWT",
      );
    }

    const payload: Record<string, unknown> = verify.payload;
    if (!isAuthPayload(payload)) {
      throw new BadRequestException("Unexpected JWT Payload");
    }
    return payload;
  }
}

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
import {
  AccountWithBans,
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
  TOTP,
  TokenSuccessfulResponse,
  UnknownOAuthError,
  decodeBase32,
  generateOTP,
  isBase32,
} from "akasha-lib";
import { Account, Authorization, Session } from "@prisma/client";
import * as jose from "jose";
import { JWTHashAlgorithm, jwtSignatureHMAC, jwtVerifyHMAC } from "akasha-lib";
import {
  AuthLevel,
  AuthPayload,
  TokenSet,
  isAuthPayload,
} from "@common/auth-payloads";
import { getBanTypeNumber, getRoleNumber } from "@common/generated/types";

@Injectable()
export class AuthService {
  static readonly JWT_ALGORITHM: JWTHashAlgorithm = "HS256";

  protected readonly logger = new Logger(AuthService.name);
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
          source.oauth,
          authorizationCode,
          state.redirectURI,
        );
      const subject: string = await AuthService.fetchSubject(source, param);

      const account: AccountWithBans =
        await this.accounts.findOrCreateAccountForAuth(source.key, subject);

      if (account.otpSecret !== null) {
        // Issue temporary token that require promotion using OTP.
        return await this.makeTemporaryToken(account);
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
      const session: Session | null = await this.sessions.refreshSession(
        refreshToken,
      );
      if (session === null) {
        throw new UnauthorizedException("Not found token");
      }

      const account: AccountWithBans | null =
        await this.accounts.findAccountForAuth(session.accountId);
      if (account === null) {
        this.sessions.invalidateSession(session.id);
        throw new ForbiddenException("Gone account");
      }

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

      const state: Authorization | null =
        await this.sessions.findAndDeleteTemporaryState(auth.state);
      if (state === null) {
        throw new BadRequestException("Not found state");
      }

      const accountId: number = await this.accounts.findAccountIdByUUID(
        //XXX: Hack
        state.redirectURI,
      );
      const account: AccountWithBans | null =
        await this.accounts.findAccountForAuth(accountId);
      if (account === null) {
        throw new BadRequestException("Not found account");
      }

      if (account.otpSecret === null) {
        throw new InternalServerErrorException("Missing OTP data");
      }
      const params = new URLSearchParams(account.otpSecret);

      const secretStr: string | null = params.get("secret");
      const codeDigitsStr: string | null = params.get("digits");
      const movingPeriodStr: string | null = params.get("period");
      const algorithm: string | null = params.get("algorithm");
      if (
        secretStr === null ||
        codeDigitsStr === null ||
        movingPeriodStr === null ||
        algorithm === null
      ) {
        throw new InternalServerErrorException("Corrupted OTP data");
      }

      const codeDigits = Number(codeDigitsStr);
      const movingPeriod = Number(movingPeriodStr);
      if (Number.isNaN(codeDigits) || Number.isNaN(movingPeriod)) {
        throw new InternalServerErrorException("Corrupted OTP data (numbers)");
      }

      if (
        algorithm !== "SHA-256" &&
        algorithm !== "SHA-384" &&
        algorithm !== "SHA-512"
      ) {
        throw new InternalServerErrorException(
          "Corrupted OTP data (algorithm)",
        );
      }

      if (!isBase32(secretStr)) {
        throw new InternalServerErrorException("Corrupted OTP data (base32)");
      }

      const secret = decodeBase32(secretStr);
      const movingFactor = TOTP.getMovingFactor(movingPeriod);

      const serverOTP: string = await generateOTP(
        secret,
        movingFactor,
        codeDigits,
        algorithm,
      );

      if (clientOTP !== serverOTP) {
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
      //XXX: Temporary access token을 일회용으로 만들기 위하여 endpointKey에 빈 문자열을 사용하여 표시하고 활용했음.
      endpointKey: "",
      //XXX: 계정의 식별자로 정수형 ID를 사용하는 것이 효율적이나 형식과 관계의 설정이 번거로운 관계로 UUID를 활용했음.
      redirectURI: account.uuid,
    });

    const payload: AuthPayload = {
      auth_level: AuthLevel.TEMPORARY,
      state: state.id,
    };

    const accessToken: string = await jwtSignatureHMAC(
      AuthService.JWT_ALGORITHM,
      this.config.jwt_secret,
      payload,
      this.config.jwt_temp_expire_secs,
      this.config.jwt_options,
    );

    return { access_token: accessToken };
  }

  private async makeBlockedToken(account: AccountWithBans): Promise<TokenSet> {
    const payload: AuthPayload = {
      auth_level: AuthLevel.BLOCKED,
      user_id: account.uuid,
      bans: account.bans.map((e) => ({
        type: getBanTypeNumber(e.type),
        reason: e.reason,
        expireTimestamp: e.expireTimestamp,
      })),
    };

    const accessToken: string = await jwtSignatureHMAC(
      AuthService.JWT_ALGORITHM,
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
      user_id: account.uuid,
      user_role: getRoleNumber(account.role),
    };

    const accessToken: string = await jwtSignatureHMAC(
      AuthService.JWT_ALGORITHM,
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
      AuthService.JWT_ALGORITHM,
      this.config.jwt_secret,
      this.config.jwt_options,
    );

    if (!verify.success) {
      throw verify.expired
        ? new UnauthorizedException("Expired JWT")
        : new BadRequestException("Invalid JWT");
    }

    const payload: Record<string, unknown> = verify.payload;
    if (!isAuthPayload(payload)) {
      throw new InternalServerErrorException("Unexpected JWT Payload");
    }
    return payload;
  }
}

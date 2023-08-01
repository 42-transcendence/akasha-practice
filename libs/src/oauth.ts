// Reference: https://datatracker.ietf.org/doc/html/rfc6749

export class OAuthError extends Error {
  override get name() {
    return "OAuthError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class UnknownOAuthError extends OAuthError {
  override get name() {
    return "UnknownOAuthError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class InvalidStateError extends UnknownOAuthError {
  override get name() {
    return "InvalidStateError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class MultipleParameterError extends UnknownOAuthError {
  override get name() {
    return "MultipleParameterError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class UndefinedResponseError extends UnknownOAuthError {
  override get name() {
    return "UndefinedResponseError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class UndefinedSuccessfulResponseError extends UnknownOAuthError {
  override get name() {
    return "UndefinedSuccessfulResponseError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class UndefinedErrorResponseError extends UnknownOAuthError {
  override get name() {
    return "UndefinedErrorResponseError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class UndefinedHTTPStatusError extends UnknownOAuthError {
  override get name() {
    return "UndefinedHTTPStatusError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export type OAuthErrorProps = {
  error: string;
  error_description?: string | undefined;
  error_uri?: string | undefined;
};

export class OAuthDefinedError extends OAuthError {
  constructor(
    readonly error_description?: string | undefined,
    readonly error_uri?: string | undefined
  ) {
    super(error_description);
  }

  override get name() {
    return "OAuthDefinedError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class InvalidRequestError extends OAuthDefinedError {
  override get name() {
    return "InvalidRequestError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class InvalidClientError extends OAuthDefinedError {
  override get name() {
    return "InvalidClientError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class InvalidGrantError extends OAuthDefinedError {
  override get name() {
    return "InvalidGrantError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class InvalidScopeError extends OAuthDefinedError {
  override get name() {
    return "InvalidScopeError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class AccessDeniedError extends OAuthDefinedError {
  override get name() {
    return "AccessDeniedError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class UnauthorizedClientError extends OAuthDefinedError {
  override get name() {
    return "UnauthorizedClientError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class UnsupportedGrantTypeError extends OAuthDefinedError {
  override get name() {
    return "UnsupportedGrantTypeError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class UnsupportedResponseTypeError extends OAuthDefinedError {
  override get name() {
    return "UnsupportedResponseTypeError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class ServerErrorError extends OAuthDefinedError {
  override get name() {
    return "ServerErrorError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class TemporarilyUnavailableError extends OAuthDefinedError {
  override get name() {
    return "TemporarilyUnavailableError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export type AuthorizationResponse = {
  state: string | undefined;
  code: string;
  redirectURI: string;
};

type AuthorizationError =
  | "invalid_request" // The request is missing a required parameter, includes an invalid parameter value, includes a parameter more than once, or is otherwise malformed.
  | "unauthorized_client" // The client is not authorized to request an authorization code using this method.
  | "access_denied" // The resource owner or authorization server denied the request.
  | "unsupported_response_type" // The authorization server does not support obtaining an authorization code using this method.
  | "invalid_scope" // The requested scope is invalid, unknown, or malformed.
  | "server_error" // The authorization server encountered an unexpected condition that prevented it from fulfilling the request. (This error code is needed because a 500 Internal Server Error HTTP status code cannot be returned to the client via an HTTP redirect.)
  | "temporarily_unavailable"; // The authorization server is currently unable to handle the request due to a temporary overloading or maintenance of the server.  (This error code is needed because a 503 Service Unavailable HTTP status code cannot be returned to the client via an HTTP redirect.)

export function isAuthorizationErrorResponseError(
  value: string
): value is AuthorizationError {
  return (
    value === "invalid_request" ||
    value === "unauthorized_client" ||
    value === "access_denied" ||
    value === "unsupported_response_type" ||
    value === "invalid_scope" ||
    value === "server_error" ||
    value === "temporarily_unavailable"
  );
}

export type AuthorizationErrorProps = OAuthErrorProps & {
  error: AuthorizationError;
};

function throwAuthorizationError(
  errorResponse: AuthorizationErrorProps
): never {
  switch (errorResponse.error) {
    case "invalid_request":
      throw new InvalidRequestError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "unauthorized_client":
      throw new UnauthorizedClientError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "access_denied":
      throw new AccessDeniedError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "unsupported_response_type":
      throw new UnsupportedResponseTypeError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "invalid_scope":
      throw new InvalidScopeError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "server_error":
      throw new ServerErrorError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "temporarily_unavailable":
      throw new TemporarilyUnavailableError(
        errorResponse.error_description,
        errorResponse.error_uri
      );
  }
}

export type TokenRequestBase = Record<string, string | undefined> & {
  grant_type: string;
};

export type AuthorizationCodeRequest = TokenRequestBase & {
  grant_type: "authorization_code";
  code: string;
  redirect_uri: string;
  client_id: string;
  client_secret: string;
};

export type RefreshTokenRequest = TokenRequestBase & {
  grant_type: "refresh_token";
  refresh_token: string;
  scope?: string | undefined;
};

export type TokenRequest = AuthorizationCodeRequest | RefreshTokenRequest;

export type TokenSuccessfulResponse = {
  access_token: string;
  token_type: string;
  expires_in?: string | undefined;
  refresh_token?: string | undefined;
  scope?: string | undefined;
};

export function isTokenSuccessfulResponse(
  value: any
): value is TokenSuccessfulResponse {
  return (
    value &&
    typeof value === "object" &&
    "access_token" in value &&
    typeof value.access_token === "string" &&
    "token_type" in value &&
    typeof value.token_type === "string"
  );
}

type TokenError =
  | "invalid_request" // The request is missing a required parameter, includes an unsupported parameter value (other than grant type), repeats a parameter, includes multiple credentials, utilizes more than one mechanism for authenticating the client, or is otherwise malformed.
  | "invalid_client" // Client authentication failed (e.g., unknown client, no client authentication included, or unsupported authentication method).  The authorization server MAY return an HTTP 401 (Unauthorized) status code to indicate which HTTP authentication schemes are supported.  If the client attempted to authenticate via the "Authorization" request header field, the authorization server MUST respond with an HTTP 401 (Unauthorized) status code and include the "WWW-Authenticate" response header field matching the authentication scheme used by the client.
  | "invalid_grant" // The provided authorization grant (e.g., authorization code, resource owner credentials) or refresh token is invalid, expired, revoked, does not match the redirection URI used in the authorization request, or was issued to another client.
  | "unauthorized_client" // The authenticated client is not authorized to use this authorization grant type.
  | "unsupported_grant_type" // The authorization grant type is not supported by the authorization server.
  | "invalid_scope"; // The requested scope is invalid, unknown, malformed, or exceeds the scope granted by the resource owner.

export type TokenErrorProps = OAuthErrorProps & {
  error: TokenError;
};

export function isTokenErrorResponse(value: any): value is TokenErrorProps {
  return (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string" &&
    (value.error === "invalid_request" ||
      value.error === "invalid_client" ||
      value.error === "invalid_grant" ||
      value.error === "unauthorized_client" ||
      value.error === "unsupported_grant_type" ||
      value.error === "invalid_scope")
  );
}

function throwTokenError(errorResponse: TokenErrorProps): never {
  switch (errorResponse.error) {
    case "invalid_request":
      throw new InvalidRequestError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "invalid_client":
      throw new InvalidClientError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "invalid_grant":
      throw new InvalidGrantError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "unauthorized_client":
      throw new UnauthorizedClientError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "unsupported_grant_type":
      throw new UnsupportedGrantTypeError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "invalid_scope":
      throw new InvalidScopeError(
        errorResponse.error_description,
        errorResponse.error_uri
      );
  }
}

export class OAuth {
  constructor(
    private readonly authorizationEndpoint: string,
    private readonly tokenEndpoint: string,
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  beginAuthorizationCodeURL(
    redirectURI: string,
    scopes: string[],
    state?: string | undefined
  ): string {
    const authorizationURL = new URL(this.authorizationEndpoint);
    authorizationURL.searchParams.set("response_type", "code");
    authorizationURL.searchParams.set("client_id", this.clientId);
    authorizationURL.searchParams.set("redirect_uri", redirectURI);
    authorizationURL.searchParams.set("scope", scopes.join(" "));
    if (state) {
      authorizationURL.searchParams.set("state", state);
    }
    return authorizationURL.toString();
  }

  async endAuthorizationCodeURL(
    query: Record<keyof any, unknown>,
    _getRedirectURI: (state: string | undefined) => Promise<string | undefined>
  ): Promise<AuthorizationResponse> {
    function _getQueryParamOnly(
      query: Record<keyof any, unknown>,
      key: keyof any
    ): string | undefined {
      const value: unknown = query[key];
      switch (typeof value) {
        case "boolean":
        case "number":
        case "bigint":
        case "string":
        case "symbol":
          return value.toString();
        case "object":
        case "function":
          throw new MultipleParameterError();
        case "undefined":
        default:
          return undefined;
      }
    }

    const state = _getQueryParamOnly(query, "state");
    const redirectURI = await _getRedirectURI(state);
    if (!redirectURI) {
      throw new InvalidStateError();
    }

    const error = _getQueryParamOnly(query, "error");
    if (error) {
      if (!isAuthorizationErrorResponseError(error)) {
        throw new UndefinedErrorResponseError();
      }

      const error_description = _getQueryParamOnly(query, "error_description");
      const error_uri = _getQueryParamOnly(query, "error_uri");

      throwAuthorizationError({ error, error_description, error_uri });
    }

    const code = _getQueryParamOnly(query, "code");
    if (!code) {
      throw new UndefinedSuccessfulResponseError();
    }

    return {
      state,
      code,
      redirectURI,
    };
  }

  makeAuthorizationCodeRequest(
    authorizationCode: AuthorizationResponse
  ): AuthorizationCodeRequest {
    return {
      grant_type: "authorization_code",
      code: authorizationCode.code,
      redirect_uri: authorizationCode.redirectURI,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    };
  }

  makeRefreshTokenRequest(refreshToken: string): RefreshTokenRequest {
    return {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    };
  }

  async fetchToken(param: TokenRequest): Promise<TokenSuccessfulResponse> {
    const method = "POST";
    const headers = new URLSearchParams();
    const body = new URLSearchParams();

    headers.set(
      "content-type",
      "application/x-www-form-urlencoded;charset=UTF-8"
    );
    headers.set("accept", "application/json");

    for (const key in param) {
      const value: string | undefined = param[key];
      if (value) {
        body.set(key, value);
      }
    }

    const response: Response = await fetch(new URL(this.tokenEndpoint), {
      method,
      headers,
      body,
    });

    if (response.ok) {
      const successfulResponse: unknown = await response.json();

      if (!isTokenSuccessfulResponse(successfulResponse)) {
        throw new UndefinedSuccessfulResponseError();
      }

      return successfulResponse;
    } else if (response.status === 400) {
      const errorResponse: unknown = await response.json();

      if (!isTokenErrorResponse(errorResponse)) {
        throw new UndefinedErrorResponseError();
      }

      throwTokenError(errorResponse);
    } else if (response.status === 401) {
      throw new InvalidClientError();
    } else {
      throw new UndefinedHTTPStatusError();
    }
  }
}

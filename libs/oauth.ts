// Reference: https://datatracker.ietf.org/doc/html/rfc6749

export class OAuthError extends Error {}

export class UnknownOAuthError extends OAuthError {}

export class InvalidStateError extends UnknownOAuthError {}

export class MultipleParameterError extends UnknownOAuthError {}

export class UndefinedResponseError extends UnknownOAuthError {}

export class UndefinedSuccessfulResponseError extends UnknownOAuthError {}

export class UndefinedErrorResponseError extends UnknownOAuthError {}

export class UndefinedHTTPStatusError extends UnknownOAuthError {}

interface OAuthErrorProps {
  error: string;
  error_description?: string;
  error_uri?: string;
}

export class OAuthDefinedError extends OAuthError {
  constructor(
    readonly error_description?: string,
    readonly error_uri?: string
  ) {
    super(error_description);
  }
}

export class InvalidRequestError extends OAuthDefinedError {}

export class InvalidClientError extends OAuthDefinedError {}

export class InvalidGrantError extends OAuthDefinedError {}

export class InvalidScopeError extends OAuthDefinedError {}

export class AccessDeniedError extends OAuthDefinedError {}

export class UnauthorizedClientError extends OAuthDefinedError {}

export class UnsupportedGrantTypeError extends OAuthDefinedError {}

export class UnsupportedResponseTypeError extends OAuthDefinedError {}

export class ServerErrorError extends OAuthDefinedError {}

export class TemporarilyUnavailableError extends OAuthDefinedError {}

interface AuthorizationResponse {
  state: string;
  code: string;
  redirectURI: string;
}

type AuthorizationError =
  | "invalid_request" // The request is missing a required parameter, includes an invalid parameter value, includes a parameter more than once, or is otherwise malformed.
  | "unauthorized_client" // The client is not authorized to request an authorization code using this method.
  | "access_denied" // The resource owner or authorization server denied the request.
  | "unsupported_response_type" // The authorization server does not support obtaining an authorization code using this method.
  | "invalid_scope" // The requested scope is invalid, unknown, or malformed.
  | "server_error" // The authorization server encountered an unexpected condition that prevented it from fulfilling the request. (This error code is needed because a 500 Internal Server Error HTTP status code cannot be returned to the client via an HTTP redirect.)
  | "temporarily_unavailable"; // The authorization server is currently unable to handle the request due to a temporary overloading or maintenance of the server.  (This error code is needed because a 503 Service Unavailable HTTP status code cannot be returned to the client via an HTTP redirect.)

function isAuthorizationErrorResponseError(
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

interface AuthorizationErrorProps extends OAuthErrorProps {
  error: AuthorizationError;
}

function newAuthorizationError(
  errorResponse: AuthorizationErrorProps
): OAuthDefinedError {
  switch (errorResponse.error) {
    case "invalid_request":
      return new InvalidRequestError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "unauthorized_client":
      return new UnauthorizedClientError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "access_denied":
      return new AccessDeniedError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "unsupported_response_type":
      return new UnsupportedResponseTypeError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "invalid_scope":
      return new InvalidScopeError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "server_error":
      return new ServerErrorError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "temporarily_unavailable":
      return new TemporarilyUnavailableError(
        errorResponse.error_description,
        errorResponse.error_uri
      );
  }
}

interface TokenRequestBase extends Record<string, string | undefined> {
  grant_type: string;
}

interface AuthorizationCodeRequest extends TokenRequestBase {
  grant_type: "authorization_code";
  code: string;
  redirect_uri: string;
  client_id: string;
  client_secret: string;
}

interface RefreshTokenRequest extends TokenRequestBase {
  grant_type: "refresh_token";
  refresh_token: string;
  scope?: string;
}

type TokenRequest = AuthorizationCodeRequest | RefreshTokenRequest;

interface TokenSuccessfulResponse {
  access_token: string;
  token_type: string;
  expires_in?: string;
  refresh_token?: string;
  scope?: string;
}

function isTokenSuccessfulResponse(
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

interface TokenErrorProps extends OAuthErrorProps {
  error: TokenError;
}

function isTokenErrorResponse(value: any): value is TokenErrorProps {
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

function newTokenError(errorResponse: TokenErrorProps): OAuthDefinedError {
  switch (errorResponse.error) {
    case "invalid_request":
      return new InvalidRequestError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "invalid_client":
      return new InvalidClientError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "invalid_grant":
      return new InvalidGrantError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "unauthorized_client":
      return new UnauthorizedClientError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "unsupported_grant_type":
      return new UnsupportedGrantTypeError(
        errorResponse.error_description,
        errorResponse.error_uri
      );

    case "invalid_scope":
      return new InvalidScopeError(
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
    state?: string
  ): URL {
    const authorizationUrl = new URL(this.authorizationEndpoint);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", this.clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectURI);
    authorizationUrl.searchParams.set("scope", scopes.join(" "));
    if (state) {
      authorizationUrl.searchParams.set("state", state);
    }
    return authorizationUrl;
  }

  endAuthorizationCodeURL(
    url: URL,
    _getRedirectURI: (state: string) => string | undefined
  ): AuthorizationResponse {
    function _getSearchParamOnly(url: URL, key: string): string | undefined {
      const values: string[] = url.searchParams.getAll(key);

      if (values.length === 0) {
        return undefined;
      }

      if (values.length > 1) {
        throw new MultipleParameterError();
      }

      return values[0];
    }

    const state = _getSearchParamOnly(url, "state");
    if (!state) {
      throw new UndefinedResponseError();
    }

    const redirectURI = _getRedirectURI(state);
    if (!redirectURI) {
      throw new InvalidStateError();
    }

    const error = _getSearchParamOnly(url, "error");
    if (error) {
      if (!isAuthorizationErrorResponseError(error)) {
        throw new UndefinedErrorResponseError();
      }

      const error_description = _getSearchParamOnly(url, "error_description");
      const error_uri = _getSearchParamOnly(url, "error_uri");

      throw newAuthorizationError({ error, error_description, error_uri });
    }

    const code = _getSearchParamOnly(url, "code");
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

      throw newTokenError(errorResponse);
    } else if (response.status === 401) {
      throw new InvalidClientError();
    } else {
      throw new UndefinedHTTPStatusError();
    }
  }
}

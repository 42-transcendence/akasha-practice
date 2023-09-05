import { JsonValue, RoleNumber } from "./generated/types";
import { hasProperty } from "akasha-lib";
import { BanSummaryPayload } from "./profile-payloads";

/// AuthLevel
export const enum AuthLevel {
  NONE = 0,
  TEMPORARY = 1,
  BLOCKED = 99,
  REGULAR = 100,
  COMPLETED = 101,
}

/// AuthPayload
type AuthPayloadBase = {
  auth_level: AuthLevel;
};

type NoneAuthPayload = AuthPayloadBase & {
  auth_level: AuthLevel.NONE;
};

type TemporaryAuthPayload = AuthPayloadBase & {
  auth_level: AuthLevel.TEMPORARY;
  state: string;
};

type BlockedAuthPayload = AuthPayloadBase & {
  auth_level: AuthLevel.BLOCKED;
  user_id: string;
  bans: BanSummaryPayload[];
};

type CompletedAuthPayload = AuthPayloadBase & {
  auth_level: AuthLevel.COMPLETED;
  user_id: string;
  user_role: RoleNumber;
};

export type AuthPayload =
  | NoneAuthPayload
  | TemporaryAuthPayload
  | BlockedAuthPayload
  | CompletedAuthPayload;

export function isAuthPayload(value: unknown): value is AuthPayload {
  if (
    typeof value === "object" &&
    value !== null &&
    hasProperty("number", value, "auth_level")
  ) {
    value satisfies AuthPayloadBase;
    switch (value.auth_level) {
      case AuthLevel.TEMPORARY:
        if (hasProperty("string", value, "state")) {
          value satisfies TemporaryAuthPayload;
          return true;
        }
        break;

      case AuthLevel.COMPLETED:
        if (
          hasProperty("string", value, "user_id") &&
          hasProperty("number", value, "user_role")
        ) {
          value satisfies CompletedAuthPayload;
          return true;
        }
        break;
    }
  }
  return false;
}

/// SecretParams
export type SecretParams = {
  enabled: boolean;
  codeDigits: number;
  movingPeriod: number;
  algorithm: "SHA-256" | "SHA-384" | "SHA-512";
};

function hasProperty_algorithm<T extends Record<"algorithm", string>>(
  value: T,
): value is T & Record<"algorithm", SecretParams["algorithm"]> {
  if (
    value.algorithm !== "SHA-256" &&
    value.algorithm !== "SHA-384" &&
    value.algorithm !== "SHA-512"
  ) {
    return false;
  }
  return true;
}

export function isSecretParams(value: JsonValue): value is SecretParams {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  if (
    !hasProperty("boolean", value, "enabled") ||
    !hasProperty("number", value, "codeDigits") ||
    !hasProperty("number", value, "movingPeriod") ||
    !hasProperty("string", value, "algorithm")
  ) {
    return false;
  }

  if (!hasProperty_algorithm(value)) {
    return false;
  }

  value satisfies SecretParams;
  return true;
}

export type SecretParamsView = Omit<SecretParams, "enabled">;

/// OTPSecret
export type OTPSecret = { data: string } & SecretParamsView;

/// TokenSet
export type TokenSet = {
  access_token: string;
  refresh_token?: string | undefined;
};

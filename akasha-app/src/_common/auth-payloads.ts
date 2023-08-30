import { RoleNumber } from "./generated/types";
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

/// TokenSet
export type TokenSet = {
  access_token: string;
  refresh_token?: string | undefined;
};

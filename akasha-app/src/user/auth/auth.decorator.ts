import { SetMetadata } from "@nestjs/common";
import { AuthLevel } from "@common/auth-payloads";

export const AUTH_LEVEL_MIN_KEY = "auth_level_min";
export const AuthLevelMin = (level: AuthLevel) =>
  SetMetadata(AUTH_LEVEL_MIN_KEY, level);

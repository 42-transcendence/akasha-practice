import { SetMetadata } from "@nestjs/common";
import { AuthLevel } from "./auth-payload";

export const AUTH_LEVEL_MIN_KEY = "auth_level_min";
export const AuthLevelMin = (level: AuthLevel) =>
  SetMetadata(AUTH_LEVEL_MIN_KEY, level);

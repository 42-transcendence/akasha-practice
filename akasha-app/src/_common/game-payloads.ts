import { hasProperty } from "akasha-lib";

export type GameInvitationPayload = {
  user_id: string;
  server_id: string;
  game_id: string;
  observer?: true | undefined;
};

export function isGameInvitationPayload(
  value: unknown,
): value is GameInvitationPayload {
  if (
    typeof value === "object" &&
    value !== null &&
    hasProperty("string", value, "user_id") &&
    hasProperty("string", value, "server_id") &&
    hasProperty("string", value, "game_id")
  ) {
    //TODO: type narrowing `observer`
    value satisfies GameInvitationPayload;
    return true;
  }
  return false;
}

export const enum GameMatchmakeType {
  QUEUE,
  CREATE,
  ENTER,
  RESUME,
}

export const enum MatchmakeFailedReason {
  UNKNOWN,
  DUPLICATE,
  NOT_FOUND,
}

export enum BattleField {
  SQUARE,
  ROUND,
  ABSOLUTE,

  MAX_VALUE,
}

export enum GameMode {
  UNIFORM,
  GRAVITY,

  MAX_VALUE,
}

export function isValidLimit(limit: number): boolean {
  if ((limit & 1) !== 0) {
    return false;
  }
  if (limit < 0) {
    return false;
  }
  if (limit >= 6) {
    return false;
  }

  return true;
}

export type GameRoomProps = {
  id: string;
  code: string | null;
  ladder: boolean;
};

export type GameRoomParams = {
  battleField: BattleField;
  gameMode: GameMode;
  limit: number;
  fair: boolean;
  ladder: boolean;
};

export const enum GameRoomEnterResult {
  SUCCESS,
  EXPIRED_INVITATION,
  ACCOUNT_MISMATCH,
  SERVER_MISMATCH,
  NOT_FOUND,
  EXCEED_LIMIT,
  ALREADY_STARTED,
  GAME_MISMATCH,
}

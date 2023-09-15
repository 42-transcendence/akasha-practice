import { ByteBuffer, hasProperty } from "akasha-lib";

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
};

export function readGameRoomProps(buf: ByteBuffer): GameRoomProps {
  const id = buf.readUUID();
  const code = buf.readNullable(buf.readString);
  return { id, code };
}

export function writeGameRoomProps(obj: GameRoomProps, buf: ByteBuffer) {
  buf.writeUUID(obj.id);
  buf.writeNullable(obj.code, buf.writeString);
}

export type GameRoomParams = {
  battleField: BattleField;
  gameMode: GameMode;
  limit: number;
  fair: boolean;
};

export function readGameRoomParams(buf: ByteBuffer): GameRoomParams {
  const battleField = buf.read4Unsigned();
  const gameMode = buf.read1();
  const limit = buf.read2Unsigned();
  const fair = buf.readBoolean();
  return { battleField, gameMode, limit, fair };
}

export function writeGameRoomParams(obj: GameRoomParams, buf: ByteBuffer) {
  buf.write4Unsigned(obj.battleField);
  buf.write1(obj.gameMode);
  buf.write2Unsigned(obj.limit);
  buf.writeBoolean(obj.fair);
}

export type GameMemberParams = {
  accountId: string;
  character: number;
  specification: number;
  team: number;
  ready: boolean;
};

export function readGameMemberParams(buf: ByteBuffer): GameMemberParams {
  const accountId = buf.readUUID();
  const character = buf.read1();
  const specification = buf.read1();
  const team = buf.read1();
  const ready = buf.readBoolean();
  return { accountId, character, specification, team, ready };
}

export function writeGameMemberParams(obj: GameMemberParams, buf: ByteBuffer) {
  buf.writeUUID(obj.accountId);
  buf.write1(obj.character);
  buf.write1(obj.specification);
  buf.write1(obj.team);
  buf.writeBoolean(obj.ready);
}

export const enum GameRoomEnterResult {
  SUCCESS,
  EXPIRED_INVITATION,
  ACCOUNT_MISMATCH,
  SERVER_MISMATCH,
  NOT_FOUND,
  EXCEED_LIMIT,
  ALREADY_STARTED,
  GAME_MISMATCH,
  DUPLICATE,
}

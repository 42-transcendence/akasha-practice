import { GameServerOpcode } from "@common/game-opcodes";
import {
  BattleField,
  GameMatchmakeType,
  GameMode,
} from "@common/game-payloads";
import { ByteBuffer } from "akasha-lib";

export function makeMatchmakeHandshakeQueue() {
  const buf = ByteBuffer.createWithOpcode(GameServerOpcode.HANDSHAKE_MATCHMAKE);
  buf.write1(GameMatchmakeType.QUEUE);
  return buf;
}

export function makeMatchmakeHandshakeCreate(
  battleField: BattleField,
  gameMode: GameMode,
  limit: number,
  fair: boolean,
) {
  const buf = ByteBuffer.createWithOpcode(GameServerOpcode.HANDSHAKE_MATCHMAKE);
  buf.write1(GameMatchmakeType.CREATE);
  buf.write4Unsigned(battleField);
  buf.write1(gameMode);
  buf.write2Unsigned(limit);
  buf.writeBoolean(fair);
  return buf;
}

export function makeMatchmakeHandshakeEnter(entryCode: string) {
  const buf = ByteBuffer.createWithOpcode(GameServerOpcode.HANDSHAKE_MATCHMAKE);
  buf.write1(GameMatchmakeType.ENTER);
  buf.writeString(entryCode);
  return buf;
}

export function makeMatchmakeHandshakeResume() {
  const buf = ByteBuffer.createWithOpcode(GameServerOpcode.HANDSHAKE_MATCHMAKE);
  buf.write1(GameMatchmakeType.RESUME);
  return buf;
}

export function makeGameHandshake(invitation: string) {
  const buf = ByteBuffer.createWithOpcode(GameServerOpcode.HANDSHAKE_GAME);
  buf.writeString(invitation);
  return buf;
}

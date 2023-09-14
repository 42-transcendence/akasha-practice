import { GameServerOpcode } from "@common/game-opcodes";
import {
  GameMatchmakeType,
  GameRoomParams,
  writeGameRoomParams,
} from "@common/game-payloads";
import { ByteBuffer } from "akasha-lib";

export function makeMatchmakeHandshakeQueue() {
  const buf = ByteBuffer.createWithOpcode(GameServerOpcode.HANDSHAKE_MATCHMAKE);
  buf.write1(GameMatchmakeType.QUEUE);
  return buf;
}

export function makeMatchmakeHandshakeCreate(params: GameRoomParams) {
  const buf = ByteBuffer.createWithOpcode(GameServerOpcode.HANDSHAKE_MATCHMAKE);
  buf.write1(GameMatchmakeType.CREATE);
  writeGameRoomParams(params, buf);
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

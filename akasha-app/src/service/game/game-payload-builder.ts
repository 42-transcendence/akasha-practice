import { GameClientOpcode } from "@common/game-opcodes";
import {
  GameRoomEnterResult,
  GameRoomParams,
  MatchmakeFailedReason,
} from "@common/game-payloads";
import { ByteBuffer } from "akasha-lib";
import { GameMember, GameRoom } from "./game.service";

export function makeEnqueuedAlert(params: GameRoomParams) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.ENQUEUED);
  buf.write4Unsigned(params.battleField);
  buf.write1(params.gameMode);
  buf.write2(params.limit);
  buf.writeBoolean(params.fair);
  return buf;
}

export function makeInvitationPayload(invitation: string) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.INVITATION);
  buf.writeString(invitation);
  return buf;
}

export function makeMatchmakeFailed(reason: MatchmakeFailedReason) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.MATCHMAKE_FAILED);
  buf.write1(reason);
  return buf;
}

export function makeGameRoom(room: GameRoom) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.GAME_ROOM);
  buf.writeUUID(room.props.id);
  buf.writeNullable(room.props.code, buf.writeString);
  buf.write4Unsigned(room.params.battleField);
  buf.write1(room.params.gameMode);
  buf.write2(room.params.limit);
  buf.writeBoolean(room.params.fair);
  buf.writeLength(room.members.size);
  for (const [key, val] of room.members) {
    buf.writeUUID(key);
    buf.write1(val.character);
    buf.write1(val.specification);
    buf.write1(val.team);
    buf.writeBoolean(val.ready);
  }
  buf.writeBoolean(room.params.ladder);
  return buf;
}

export function makeGameFailedPayload(errno: GameRoomEnterResult) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.GAME_FAILED);
  buf.write1(errno);
  return buf;
}

export function makeEnterMember(member: GameMember) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.ENTER_MEMBER);
  buf.writeUUID(member.accountId);
  buf.write1(member.character);
  buf.write1(member.specification);
  buf.write1(member.team);
  buf.writeBoolean(member.ready);
  return buf;
}

export function makeUpdateMember(accountId: string, member: GameMember) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.UPDATE_MEMBER);
  buf.writeUUID(accountId);
  buf.write1(member.character);
  buf.write1(member.specification);
  buf.write1(member.team);
  buf.writeBoolean(member.ready);
  return buf;
}

export function makeLeaveMember(accountId: string) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.LEAVE_MEMBER);
  buf.writeUUID(accountId);
  return buf;
}

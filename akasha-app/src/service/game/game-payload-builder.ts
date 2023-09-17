import { GameClientOpcode } from "@common/game-opcodes";
import {
  GameMemberStatistics,
  GameProgress,
  GameRoomEnterResult,
  GameRoomParams,
  GameStatistics,
  MatchmakeFailedReason,
  writeGameMemberParams,
  writeGameMemberStatistics,
  writeGameProgress,
  writeGameRoomParams,
  writeGameRoomProps,
  writeGameStatistics,
} from "@common/game-payloads";
import { ByteBuffer } from "akasha-lib";
import { GameMember, GameRoom } from "./game-room";
import { GravityObj, writeGravityObjs } from "@common/game-physics-payloads";

export function makeEnqueuedAlert(params: GameRoomParams) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.ENQUEUED);
  writeGameRoomParams(params, buf);
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
  writeGameRoomProps(room.props, buf);
  writeGameRoomParams(room.params, buf);
  buf.writeLength(room.members.size);
  for (const [, member] of room.members) {
    writeGameMemberParams(member, buf);
  }
  buf.writeBoolean(room.ladder);
  return buf;
}

export function makeGameFailedPayload(errno: GameRoomEnterResult) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.GAME_FAILED);
  buf.write1(errno);
  return buf;
}

export function makeEnterMember(member: GameMember) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.ENTER_MEMBER);
  writeGameMemberParams(member, buf);
  return buf;
}

export function makeUpdateMember(accountId: string, member: GameMember) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.UPDATE_MEMBER);
  writeGameMemberParams({ ...member, accountId }, buf);
  return buf;
}

export function makeLeaveMember(accountId: string) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.LEAVE_MEMBER);
  buf.writeUUID(accountId);
  return buf;
}

export function makeUpdateGame(progress: GameProgress | undefined) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.UPDATE_GAME);
  buf.writeNullable(progress ?? null, writeGameProgress);
  return buf;
}

export function makeGameResult(
  statistics: GameStatistics,
  memberStatistics: GameMemberStatistics[],
) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.GAME_RESULT);
  writeGameStatistics(statistics, buf);
  buf.writeArray(memberStatistics, writeGameMemberStatistics);
  return buf;
}

export function makeAchievement(accountId: string, achievementId: number) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.ACHIEVEMENT);
  buf.writeUUID(accountId);
  buf.write2Unsigned(achievementId);
  return buf;
}

//TODO: SYNCHRONIZE,

export function makeEndOfRally(
  setNumber: number,
  scoreTeam: number,
  scoreValue: number,
) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.END_OF_RALLY);
  buf.write1(setNumber);
  buf.write1(scoreTeam);
  buf.write1(scoreValue);
  return buf;
}

export function makeEndOfSet(
  setNumber: number,
  teamScore_0: number,
  teamScore_1: number,
) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.END_OF_SET);
  buf.write1(setNumber);
  buf.write1(teamScore_0);
  buf.write1(teamScore_1);
  return buf;
}

export function makeEndOfGame(incompleted: boolean) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.END_OF_GAME);
  buf.writeBoolean(incompleted);
  return buf;
}

export function makeCountdown(countdown: number) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.COUNTDOWN);
  buf.write1Signed(countdown);
  return buf;
}

export function makeGravityObjs(objs: GravityObj[]) {
  const buf = ByteBuffer.createWithOpcode(GameClientOpcode.GRAVITY_OBJS);
  writeGravityObjs(objs, buf);
  return buf;
}

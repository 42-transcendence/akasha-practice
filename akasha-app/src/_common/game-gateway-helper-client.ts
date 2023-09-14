import { ByteBuffer } from "akasha-lib";
import { BattleField, GameMode, MatchmakeFailedReason } from "./game-payloads";

export function handleEnqueueAlert(
  payload: ByteBuffer,
): [
  battleField: BattleField,
  gameMode: GameMode,
  limit: number,
  fair: boolean,
] {
  const battleField = payload.read4Unsigned();
  const gameMode = payload.read1();
  const limit = payload.read2();
  const fair = payload.readBoolean();
  return [battleField, gameMode, limit, fair];
}

export function handleInvitationPayload(payload: ByteBuffer): string {
  const invitation = payload.readString();
  return invitation;
}

export function handleMatchmakeFailed(
  payload: ByteBuffer,
): MatchmakeFailedReason {
  const reason = payload.read1();
  return reason;
}

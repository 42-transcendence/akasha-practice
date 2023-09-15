import { ByteBuffer } from "akasha-lib";
import {
  GameRoomParams,
  MatchmakeFailedReason,
  readGameRoomParams,
} from "./game-payloads";

export function handleEnqueuedAlert(payload: ByteBuffer): GameRoomParams {
  const params = readGameRoomParams(payload);
  return params;
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

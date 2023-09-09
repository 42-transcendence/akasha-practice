/* eslint-disable @typescript-eslint/unbound-method */
import { ByteBuffer } from "akasha-lib";
import type { ChatRoomChatMessagePairEntry } from "@common/chat-payloads";
import {
  writeChatRoomChatMessagePair,
  FriendModifyFlags,
  ChatRoomModeFlags,
  RoomModifyFlags,
} from "@common/chat-payloads";
import { ChatServerOpcode } from "@common/chat-opcodes";
import type { ActiveStatusNumber, RoleNumber } from "@common/generated/types";

export function makeHandshakePayload(
  fetchedMessageIdPairs: ChatRoomChatMessagePairEntry[],
  fetchedMessageIdPairsDirect: ChatRoomChatMessagePairEntry[],
) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.HANDSHAKE);
  buf.writeArray(fetchedMessageIdPairs, writeChatRoomChatMessagePair);
  buf.writeArray(fetchedMessageIdPairsDirect, writeChatRoomChatMessagePair);
  return buf;
}

export function makeActiveStatusManualRequest(
  activeStatus: ActiveStatusNumber,
) {
  const buf = ByteBuffer.createWithOpcode(
    ChatServerOpcode.ACTIVE_STATUS_MANUAL,
  );
  buf.write1(activeStatus);
  return buf;
}

export function makeIdleAutoRequest(idle: boolean) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.IDLE_AUTO);
  buf.writeBoolean(idle);
  return buf;
}

type TargetAccount = string | { nickName: string; nickTag: number };

export function makeAddFriendRequest(
  targetAccount: TargetAccount,
  groupName: string,
  activeFlags: number,
) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.ADD_FRIEND);
  if (typeof targetAccount === "string") {
    buf.writeBoolean(false);
    buf.writeUUID(targetAccount);
  } else {
    //NOTE: Lookup
    buf.writeBoolean(true);
    buf.writeString(targetAccount.nickName);
    buf.write4Unsigned(targetAccount.nickTag);
  }
  buf.writeString(groupName);
  buf.write1(activeFlags);
  return buf;
}

export function makeModifyFriendRequest(
  targetAccountId: string,
  groupName: string | undefined,
  activeFlags: number | undefined,
) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.MODIFY_FRIEND);
  buf.writeUUID(targetAccountId);
  const modifyFlags =
    (groupName !== undefined ? FriendModifyFlags.MODIFY_GROUP_NAME : 0) |
    (activeFlags !== undefined ? FriendModifyFlags.MODIFY_ACTIVE_FLAGS : 0);
  buf.write1(modifyFlags);
  if (groupName !== undefined) {
    buf.writeString(groupName);
  }
  if (activeFlags !== undefined) {
    buf.write1(activeFlags);
  }
  return buf;
}

export function makeDeleteFriendRequest(targetAccountId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.DELETE_FRIEND);
  buf.writeUUID(targetAccountId);
  return buf;
}

export function makeAddEnemyRequest(
  targetAccount: TargetAccount,
  memo: string,
) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.ADD_ENEMY);
  if (typeof targetAccount === "string") {
    buf.writeBoolean(false);
    buf.writeUUID(targetAccount);
  } else {
    //NOTE: Lookup
    buf.writeBoolean(true);
    buf.writeString(targetAccount.nickName);
    buf.write4Unsigned(targetAccount.nickTag);
  }
  buf.writeString(memo);
  return buf;
}

export function makeModifyEnemyRequest(targetAccountId: string, memo: string) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.MODIFY_ENEMY);
  buf.writeUUID(targetAccountId);
  buf.writeString(memo);
  return buf;
}

export function makeDeleteEnemyRequest(targetAccountId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.DELETE_ENEMY);
  buf.writeUUID(targetAccountId);
  return buf;
}

export function makePublicRoomListRequest() {
  return ByteBuffer.createWithOpcode(ChatServerOpcode.PUBLIC_ROOM_LIST_REQUEST);
}

export function makeCreateRoomRequest(
  title: string,
  isPrivate: boolean,
  password: string,
  limit: number,
  targetAccountIdList: string[],
) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.CREATE_ROOM);
  buf.writeString(title);
  const modeFlags =
    (isPrivate ? ChatRoomModeFlags.PRIVATE : 0) |
    (password !== "" ? ChatRoomModeFlags.SECRET : 0);
  buf.write1(modeFlags);
  if (password !== "") {
    buf.writeString(password);
  }
  buf.write2Unsigned(limit);
  buf.writeArray(targetAccountIdList, buf.writeUUID);
  return buf;
}

export function makeEnterRoomRequest(chatId: string, password: string) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.ENTER_ROOM);
  buf.writeUUID(chatId);
  buf.writeString(password);
  return buf;
}

export function makeLeaveRoomRequest(chatId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.LEAVE_ROOM);
  buf.writeUUID(chatId);
  return buf;
}

export function makeInviteUserRequest(chatId: string, targetAccountId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.INVITE_USER);
  buf.writeUUID(chatId);
  buf.writeUUID(targetAccountId);
  return buf;
}

export function makeSendMessageRequest(chatId: string, content: string) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.SEND_MESSAGE);
  buf.writeUUID(chatId);
  buf.writeString(content);
  return buf;
}

export function makeSyncCursor(chatId: string, messageId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.SYNC_CURSOR);
  writeChatRoomChatMessagePair({ chatId, messageId }, buf);
  return buf;
}

export function makeChangeRoomPropertyRequest(
  chatId: string,
  title: string | undefined,
  modeFlags: number | undefined,
  password: string | undefined,
  limit: number | undefined,
) {
  const buf = ByteBuffer.createWithOpcode(
    ChatServerOpcode.CHANGE_ROOM_PROPERTY,
  );
  buf.writeUUID(chatId);
  const modifyFlags =
    (title !== undefined ? RoomModifyFlags.MODIFY_TITLE : 0) |
    (modeFlags !== undefined ? RoomModifyFlags.MODIFY_MODE_FLAGS : 0) |
    (password !== undefined ? RoomModifyFlags.MODIFY_PASSWORD : 0) |
    (limit !== undefined ? RoomModifyFlags.MODIFY_LIMIT : 0);
  buf.write1(modifyFlags);
  if (title !== undefined) {
    buf.writeString(title);
  }
  if (modeFlags !== undefined) {
    buf.write1(modeFlags);
  }
  if (password !== undefined) {
    buf.writeString(password);
  }
  if (limit !== undefined) {
    buf.write2Unsigned(limit);
  }
  return buf;
}

export function makeChangeMemberRoleRequest(
  chatId: string,
  targetAccountId: string,
  targetRole: RoleNumber,
) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.CHANGE_MEMBER_ROLE);
  buf.writeUUID(chatId);
  buf.writeUUID(targetAccountId);
  buf.write1(targetRole);
  return buf;
}

export function makeHandoverRoomOwnerRequest(
  chatId: string,
  targetAccountId: string,
) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.HANDOVER_ROOM_OWNER);
  buf.writeUUID(chatId);
  buf.writeUUID(targetAccountId);
  return buf;
}

export function makeKickMemberRequest(
  chatId: string,
  targetAccountId: string,
  reason: string,
  memo: string,
  timespanSecs: number | null,
) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.KICK_MEMBER);
  buf.writeUUID(chatId);
  buf.writeUUID(targetAccountId);
  buf.writeString(reason);
  buf.writeString(memo);
  buf.writeNullable(timespanSecs, buf.write4Unsigned);
  return buf;
}

export function makeMuteMemberRequest(
  chatId: string,
  targetAccountId: string,
  reason: string,
  memo: string,
  timespanSecs: number | null,
) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.MUTE_MEMBER);
  buf.writeUUID(chatId);
  buf.writeUUID(targetAccountId);
  buf.writeString(reason);
  buf.writeString(memo);
  buf.writeNullable(timespanSecs, buf.write4Unsigned);
  return buf;
}

export function makeBanListRequest(chatId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.BAN_LIST_REQUEST);
  buf.writeUUID(chatId);
  return buf;
}

export function makeUnbanMemberRequest(banId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.UNBAN_MEMBER);
  buf.writeString(banId);
  return buf;
}

export function makeDestroyRoomRequest(chatId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.DESTROY_ROOM);
  buf.writeUUID(chatId);
  return buf;
}

export function makeSyncCursorDirect(
  targetAccountId: string,
  messageId: string,
) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.SYNC_CURSOR_DIRECT);
  writeChatRoomChatMessagePair({ chatId: targetAccountId, messageId }, buf);
  return buf;
}

export function makeSendDirectRequest(
  targetAccountId: string,
  content: string,
) {
  const buf = ByteBuffer.createWithOpcode(ChatServerOpcode.SEND_DIRECT);
  buf.writeUUID(targetAccountId);
  buf.writeString(content);
  return buf;
}

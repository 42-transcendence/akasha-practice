import {
  ChatEntity,
  ChatMemberEntity,
  ChatMessageEntity,
  EnemyEntity,
  FriendEntity,
} from "./generated/types";
import { AccountUUID } from "./profile-payloads";
import { ByteBuffer, NULL_UUID } from "akasha-lib";

/// FriendEntry
export type FriendEntry = AccountUUID &
  Pick<FriendEntity, "groupName" | "activeFlags">;

export function readFriend(buf: ByteBuffer): FriendEntry {
  const uuid = buf.readUUID();
  const groupName = buf.readString();
  const activeFlags = buf.read1();
  return { uuid, groupName, activeFlags };
}

export function writeFriend(obj: FriendEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.uuid);
  buf.writeString(obj.groupName);
  buf.write1(obj.activeFlags);
}

/// FriendErrorNumber
export const enum FriendErrorNumber {
  SUCCESS,
  ERROR_ALREADY_FRIEND,
  ERROR_NOT_FRIEND,
  ERROR_SELF_FRIEND,
}

/// EnemyEntry
export type EnemyEntry = AccountUUID & Pick<EnemyEntity, "memo">;

export function readEnemy(buf: ByteBuffer): EnemyEntry {
  const uuid = buf.readUUID();
  const memo = buf.readString();
  return { uuid, memo };
}

export function writeEnemy(obj: EnemyEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.uuid);
  buf.writeString(obj.memo);
}

/// SocialPayload
export type SocialPayload = {
  friendList: FriendEntry[];
  friendRequestList: string[];
  enemyList: EnemyEntry[];
};

export function readSocialPayload(buf: ByteBuffer): SocialPayload {
  const friendList = buf.readArray(readFriend);
  const friendRequestList = buf.readArray(buf.readString);
  const enemyList = buf.readArray(readEnemy);
  return { friendList, friendRequestList, enemyList };
}

export function writeSocialPayload(obj: SocialPayload, buf: ByteBuffer) {
  buf.writeArray(obj.friendList, writeFriend);
  buf.writeArray(obj.friendRequestList, buf.writeString);
  buf.writeArray(obj.enemyList, writeEnemy);
}

/// RoomErrorNumber
export const enum RoomErrorNumber {
  SUCCESS,
  ERROR_ALREADY_MEMBER,
  ERROR_NOT_MEMBER,
  ERROR_OWNER,
  ERROR_NOT_OWNER,
  ERROR_NOT_MANAGER,
}

/// ChatRoomModeFlags
export const enum ChatRoomModeFlags {
  PRIVATE = 1 << 0,
  SECRET = 1 << 1,
}

/// ChatMemberModeFlags
export const enum ChatMemberModeFlags {
  ADMIN = 1 << 0,
  MANAGER = 1 << 1,
}

/// ChatRoomUUID
export type ChatRoomUUID = Pick<ChatEntity, "uuid">;

/// ChatMessageUUID
export type ChatMessageUUID = Pick<ChatMessageEntity, "uuid">;

/// ChatRoomChatMessagePairEntry
export type ChatRoomChatMessagePairEntry = ChatRoomUUID & {
  messageUUID: ChatMessageUUID["uuid"];
};

export function readChatRoomChatMessagePair(
  buf: ByteBuffer,
): ChatRoomChatMessagePairEntry {
  const uuid = buf.readUUID();
  const messageUUID = buf.readUUID();
  return { uuid, messageUUID };
}

export function writeChatRoomChatMessagePair(
  obj: ChatRoomChatMessagePairEntry,
  buf: ByteBuffer,
) {
  buf.writeUUID(obj.uuid);
  buf.writeUUID(obj.messageUUID);
}

/// ChatRoomEntry
export type ChatRoomEntry = ChatRoomUUID &
  Pick<ChatEntity, "title" | "modeFlags" | "limit"> & {
    members: ChatRoomMemberEntry[];
  } & Pick<ChatMemberEntity, "lastMessageId">;

export function readChatRoom(buf: ByteBuffer): ChatRoomEntry {
  const uuid = buf.readUUID();
  const title = buf.readString();
  const modeFlags = buf.read1();
  const limit = buf.read2();
  const members = buf.readArray(readChatRoomMember);
  const lastMessageId = buf.readNullable(buf.readUUID, NULL_UUID);
  return { uuid, title, modeFlags, limit, members, lastMessageId };
}

export function writeChatRoom(obj: ChatRoomEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.uuid);
  buf.writeString(obj.title);
  buf.write1(obj.modeFlags);
  buf.write2(obj.limit);
  buf.writeArray(obj.members, writeChatRoomMember);
  buf.writeNullable(obj.lastMessageId, buf.writeUUID, NULL_UUID);
}

/// ChatRoomMemberEntry
export type ChatRoomMemberEntry = AccountUUID &
  Pick<ChatMemberEntity, "modeFlags">;

export function readChatRoomMember(buf: ByteBuffer): ChatRoomMemberEntry {
  const uuid = buf.readUUID();
  const modeFlags = buf.read1();
  return { uuid, modeFlags };
}

export function writeChatRoomMember(obj: ChatRoomMemberEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.uuid);
  buf.write1(obj.modeFlags);
}

/// ChatRoomViewEntry
export type ChatRoomViewEntry = ChatRoomUUID &
  Pick<ChatEntity, "title" | "modeFlags" | "limit"> & {
    memberCount: number;
  };

export function readChatRoomView(buf: ByteBuffer): ChatRoomViewEntry {
  const uuid = buf.readUUID();
  const title = buf.readString();
  const modeFlags = buf.read1();
  const limit = buf.read2();
  const memberCount = buf.read2();
  return { uuid, title, modeFlags, limit, memberCount };
}

export function writeChatRoomView(obj: ChatRoomViewEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.uuid);
  buf.writeString(obj.title);
  buf.write1(obj.modeFlags);
  buf.write2(obj.limit);
  buf.write2(obj.memberCount);
}

/// NewChatRoomRequest
export type NewChatRoomRequest = Pick<
  ChatEntity,
  "title" | "modeFlags" | "password" | "limit"
> & {
  members: ChatRoomMemberEntry[];
};

/// ChatMessageEntry
export type ChatMessageEntry = ChatMessageUUID & {
  roomUUID: ChatRoomUUID["uuid"];
  memberUUID: AccountUUID["uuid"];
} & Pick<ChatMessageEntity, "content" | "modeFlags" | "timestamp">;

export function readChatMessage(buf: ByteBuffer): ChatMessageEntry {
  const uuid = buf.readUUID();
  const roomUUID = buf.readUUID();
  const memberUUID = buf.readUUID();
  const content = buf.readString();
  const modeFlags = buf.read1();
  const timestamp = buf.readDate();
  return { uuid, roomUUID, memberUUID, content, modeFlags, timestamp };
}

export function writeChatMessage(obj: ChatMessageEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.uuid);
  buf.writeUUID(obj.roomUUID);
  buf.writeUUID(obj.memberUUID);
  buf.writeString(obj.content);
  buf.write1(obj.modeFlags);
  buf.writeDate(obj.timestamp);
}

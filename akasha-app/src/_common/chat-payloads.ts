import {
  ChatEntity,
  ChatMemberEntity,
  ChatMessageEntity,
  EnemyEntity,
  FriendEntity,
} from "./generated/types";
import { ByteBuffer, NULL_UUID } from "akasha-lib";

/// FriendActiveFlags
export const FRIEND_ACTIVE_FLAGS_SIZE = 8;
export const enum FriendActiveFlags {
  SHOW_ACTIVE_STATUS = 1 << 0,
  SHOW_ACTIVE_TIMESTAMP = 1 << 1,
  SHOW_STATUS_MESSAGE = 1 << 2,
}

/// FriendModifyFlags
export const enum FriendModifyFlags {
  MODIFY_GROUP_NAME = 1 << 0,
  MODIFY_ACTIVE_FLAGS = 1 << 1,
}

/// FriendEntry
export type FriendEntry = Pick<
  FriendEntity,
  "friendAccountId" | "groupName"
> & { activeFlags: number };

export function readFriend(buf: ByteBuffer): FriendEntry {
  const friendAccountId = buf.readUUID();
  const groupName = buf.readString();
  const activeFlags = buf.read1();
  return { friendAccountId, groupName, activeFlags };
}

export function writeFriend(obj: FriendEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.friendAccountId);
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
export type EnemyEntry = Pick<EnemyEntity, "enemyAccountId" | "memo">;

export function readEnemy(buf: ByteBuffer): EnemyEntry {
  const enemyAccountId = buf.readUUID();
  const memo = buf.readString();
  return { enemyAccountId, memo };
}

export function writeEnemy(obj: EnemyEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.enemyAccountId);
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

export function toChatRoomModeFlags(obj: {
  isPrivate: boolean;
  isSecret: boolean;
}): number {
  return (
    (obj.isPrivate ? ChatRoomModeFlags.PRIVATE : 0) |
    (obj.isSecret ? ChatRoomModeFlags.SECRET : 0)
  );
}

export function fromChatRoomModeFlags(modeFlags: number): {
  isPrivate: boolean;
  isSecret: boolean;
} {
  return {
    isPrivate: (modeFlags & ChatRoomModeFlags.PRIVATE) !== 0,
    isSecret: (modeFlags & ChatRoomModeFlags.SECRET) !== 0,
  };
}

/// ChatRoomChatMessagePairEntry
export type ChatRoomChatMessagePairEntry = {
  chatId: ChatEntity["id"];
  messageId: ChatMessageEntity["id"];
};

export function readChatRoomChatMessagePair(
  buf: ByteBuffer,
): ChatRoomChatMessagePairEntry {
  const chatId = buf.readUUID();
  const messageId = buf.readUUID();
  return { chatId, messageId };
}

export function writeChatRoomChatMessagePair(
  obj: ChatRoomChatMessagePairEntry,
  buf: ByteBuffer,
) {
  buf.writeUUID(obj.chatId);
  buf.writeUUID(obj.messageId);
}

/// ChatRoomEntry
export type ChatRoomEntry = Pick<
  ChatEntity,
  "id" | "title" | "limit" | "isPrivate" | "isSecret"
> & {
  members: ChatRoomMemberEntry[];
} & Pick<ChatMemberEntity, "lastMessageId">;

export function readChatRoom(buf: ByteBuffer): ChatRoomEntry {
  const id = buf.readUUID();
  const title = buf.readString();
  const modeFlags = buf.read1();
  const members = buf.readArray(readChatRoomMember);
  const limit = buf.read2();
  const lastMessageId = buf.readNullable(buf.readUUID, NULL_UUID);
  return {
    id,
    title,
    ...fromChatRoomModeFlags(modeFlags),
    limit,
    members,
    lastMessageId,
  };
}

export function writeChatRoom(obj: ChatRoomEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.id);
  buf.writeString(obj.title);
  buf.write2(obj.limit);
  buf.write1(toChatRoomModeFlags(obj));
  buf.writeArray(obj.members, writeChatRoomMember);
  buf.writeNullable(obj.lastMessageId, buf.writeUUID, NULL_UUID);
}

/// ChatRoomMemberEntry
export type ChatRoomMemberEntry = Pick<ChatMemberEntity, "accountId" | "role">;

export function readChatRoomMember(buf: ByteBuffer): ChatRoomMemberEntry {
  const accountId = buf.readUUID();
  const role = buf.read1();
  return { accountId, role };
}

export function writeChatRoomMember(obj: ChatRoomMemberEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.accountId);
  buf.write1(obj.role);
}

/// ChatRoomViewEntry
export type ChatRoomViewEntry = Pick<
  ChatEntity,
  "id" | "title" | "limit" | "isPrivate" | "isSecret"
> & {
  memberCount: number;
};

export function readChatRoomView(buf: ByteBuffer): ChatRoomViewEntry {
  const id = buf.readUUID();
  const title = buf.readString();
  const limit = buf.read2();
  const modeFlags = buf.read1();
  const memberCount = buf.read2();
  return { id, title, ...fromChatRoomModeFlags(modeFlags), limit, memberCount };
}

export function writeChatRoomView(obj: ChatRoomViewEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.id);
  buf.writeString(obj.title);
  buf.write2(obj.limit);
  buf.write1(toChatRoomModeFlags(obj));
  buf.write2(obj.memberCount);
}

/// NewChatRoomRequest
export type NewChatRoomRequest = Pick<
  ChatEntity,
  "title" | "password" | "limit" | "isPrivate" | "isSecret"
> & {
  members: ChatRoomMemberEntry[];
};

/// ChatMessageEntry
export type ChatMessageEntry = Pick<
  ChatMessageEntity,
  "id" | "chatId" | "accountId" | "content" | "messageType" | "timestamp"
>;

export function readChatMessage(buf: ByteBuffer): ChatMessageEntry {
  const id = buf.readUUID();
  const chatId = buf.readUUID();
  const accountId = buf.readUUID();
  const content = buf.readString();
  const messageType = buf.read1();
  const timestamp = buf.readDate();
  return { id, chatId, accountId, content, messageType, timestamp };
}

export function writeChatMessage(obj: ChatMessageEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.id);
  buf.writeUUID(obj.chatId);
  buf.writeUUID(obj.accountId);
  buf.writeString(obj.content);
  buf.write1(obj.messageType);
  buf.writeDate(obj.timestamp);
}

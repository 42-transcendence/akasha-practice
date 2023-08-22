import {
  ChatEntity,
  ChatMemberEntity,
  ChatMessageEntity,
} from "@/generated/types";
import { AccountUUID } from "@/user/profile/profile-payloads";
import { ByteBuffer, NULL_UUID } from "akasha-lib";

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

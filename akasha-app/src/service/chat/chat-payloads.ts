import { ChatEntity, ChatMemberEntity } from "@/generated/types";
import { AccountUUID } from "@/user/accounts/account-payload";
import { ByteBuffer, NULL_UUID } from "akasha-lib";

export const enum ChatRoomModeFlags {
  PRIVATE = 1 << 0,
  SECRET = 1 << 1,
}

export const enum ChatMemberModeFlags {
  ADMIN = 1 << 0,
  MANAGER = 1 << 1,
}

export type ChatRoomUUID = Pick<ChatEntity, "uuid">;

export type ChatRoomEntry = ChatRoomUUID &
  Pick<ChatEntity, "modeFlags"> & {
    members: ChatRoomMemberEntry[];
  } & Pick<ChatMemberEntity, "lastMessageId">;

export type ChatRoomMemberEntry = AccountUUID &
  Pick<ChatMemberEntity, "modeFlags">;

export function readChatRoom(buf: ByteBuffer): ChatRoomEntry {
  const uuid = buf.readUUID();
  const modeFlags = buf.read1();
  const members = buf.readArray(readChatRoomMember);
  const lastMessageId = buf.readNullable(buf.readUUID, NULL_UUID);
  return { uuid, modeFlags, members, lastMessageId };
}

export function writeChatRoom(obj: ChatRoomEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.uuid);
  buf.write1(obj.modeFlags);
  buf.writeArray(obj.members, writeChatRoomMember);
  buf.writeNullable(obj.lastMessageId, buf.writeUUID, NULL_UUID);
}

export function readChatRoomMember(buf: ByteBuffer): ChatRoomMemberEntry {
  const uuid = buf.readUUID();
  const modeFlags = buf.read1();
  return { uuid, modeFlags };
}

export function writeChatRoomMember(obj: ChatRoomMemberEntry, buf: ByteBuffer) {
  buf.writeUUID(obj.uuid);
  buf.write1(obj.modeFlags);
}

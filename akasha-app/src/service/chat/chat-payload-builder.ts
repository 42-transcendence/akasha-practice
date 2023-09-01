import { ChatClientOpcode } from "@common/chat-opcodes";
import {
  ChatMessageEntry,
  ChatRoomEntry,
  ChatRoomViewEntry,
  FriendEntry,
  FriendErrorNumber,
  RoomErrorNumber,
  SocialPayload,
  writeChatMessage,
  writeChatRoom,
  writeChatRoomMember,
  writeChatRoomView,
  writeFriend,
  writeSocialPayload,
} from "@common/chat-payloads";
import { ByteBuffer, NULL_UUID, assert } from "akasha-lib";
import {
  ChatMemberWithRoom,
  ChatRoomWithMembers,
  toChatMemberEntry,
  toChatRoomEntry,
} from "./chat.service";

export function makeInitializePayload(
  chatRoomList: ChatRoomEntry[],
  chatMessageMap: Map<string, ChatMessageEntry[]>,
  socialPayload: SocialPayload,
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.INITIALIZE);
  buf.writeArray(chatRoomList, writeChatRoom);
  buf.writeLength(chatMessageMap.size);
  for (const [key, val] of chatMessageMap) {
    buf.writeUUID(key);
    buf.writeArray(val, writeChatMessage);
  }
  writeSocialPayload(socialPayload, buf);
  return buf;
}

export function makeAddFriendFailedResult(errno: FriendErrorNumber) {
  assert(errno !== FriendErrorNumber.SUCCESS);

  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.ADD_FRIEND_RESULT);
  buf.write1(errno);
  return buf;
}

export function makeAddFriendSuccessResult(entry: FriendEntry) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.ADD_FRIEND_RESULT);
  buf.write1(FriendErrorNumber.SUCCESS);
  writeFriend(entry, buf);
  return buf;
}

export function makeFriendRequest(accountUUID: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.FRIEND_REQUEST);
  buf.writeUUID(accountUUID);
  return buf;
}

export function makeModifyFriendFailedResult(errno: FriendErrorNumber) {
  assert(errno !== FriendErrorNumber.SUCCESS);

  const buf = ByteBuffer.createWithOpcode(
    ChatClientOpcode.MODIFY_FRIEND_RESULT,
  );
  buf.write1(errno);
  return buf;
}

export function makeModifyFriendSuccessResult(
  targetUUID: string,
  entry: FriendEntry,
) {
  const buf = ByteBuffer.createWithOpcode(
    ChatClientOpcode.MODIFY_FRIEND_RESULT,
  );
  buf.write1(FriendErrorNumber.SUCCESS);
  buf.writeUUID(targetUUID);
  writeFriend(entry, buf);
  return buf;
}

export function makeUpdateFriendActiveStatus(accountUUID: string) {
  const buf = ByteBuffer.createWithOpcode(
    ChatClientOpcode.UPDATE_FRIEND_ACTIVE_STATUS,
  );
  buf.writeUUID(accountUUID);
  return buf;
}

export function makeDeleteFriendSuccessResult(targetUUID: string) {
  const bufTarget = ByteBuffer.createWithOpcode(
    ChatClientOpcode.DELETE_FRIEND_RESULT,
  );
  bufTarget.writeUUID(targetUUID);
  return bufTarget;
}

export function makePublicRoomList(chatRoomViewList: ChatRoomViewEntry[]) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.PUBLIC_ROOM_LIST);
  buf.writeArray(chatRoomViewList, writeChatRoomView);
  return buf;
}

export function makeInsertRoom(
  room: ChatRoomWithMembers,
  messages: ChatMessageEntry[],
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.INSERT_ROOM);
  writeChatRoom(toChatRoomEntry(room), buf);
  buf.writeArray(messages, writeChatMessage);
  return buf;
}

export function makeCreateRoomResult(
  errno: RoomErrorNumber,
  roomUUID: string | null,
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.CREATE_ROOM_RESULT);
  buf.write1(errno);
  buf.writeUUID(roomUUID ?? NULL_UUID);
  return buf;
}

export function makeEnterRoomResult(errno: RoomErrorNumber, roomUUID: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.ENTER_ROOM_RESULT);
  buf.write1(errno);
  buf.writeUUID(roomUUID);
  return buf;
}

export function makeRemoveRoom(roomUUID: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.REMOVE_ROOM);
  buf.writeUUID(roomUUID);
  return buf;
}

export function makeLeaveRoomResult(errno: RoomErrorNumber, roomUUID: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.LEAVE_ROOM_RESULT);
  buf.write1(errno);
  buf.writeUUID(roomUUID);
  return buf;
}

export function makeInviteRoomResult(
  errno: RoomErrorNumber,
  roomUUID: string,
  targetUUID: string,
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.INVITE_USER_RESULT);
  buf.write1(errno);
  buf.writeUUID(roomUUID);
  buf.writeUUID(targetUUID);
  return buf;
}

export function makeInsertRoomMember(
  roomUUID: string,
  member: ChatMemberWithRoom,
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.INSERT_ROOM_MEMBER);
  buf.writeUUID(roomUUID);
  writeChatRoomMember(toChatMemberEntry(member), buf);
  return buf;
}

export function makeRemoveRoomMember(roomUUID: string, memberUUID: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.REMOVE_ROOM_MEMBER);
  buf.writeUUID(roomUUID);
  buf.writeUUID(memberUUID);
  return buf;
}

export function makeChatMessagePayload(message: ChatMessageEntry) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.CHAT_MESSAGE);
  writeChatMessage(message, buf);
  return buf;
}

export function makeSyncCursorPayload(lastMessageId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.SYNC_CURSOR);
  buf.writeUUID(lastMessageId);
  return buf;
}

import { ChatClientOpcode } from "@common/chat-opcodes";
import {
  ChatMessageEntry,
  ChatRoomChatMessagePairEntry,
  ChatRoomEntry,
  ChatRoomMemberEntry,
  ChatRoomViewEntry,
  FriendEntry,
  FriendErrorNumber,
  RoomErrorNumber,
  SocialPayload,
  writeChatBanSummary,
  writeChatMessage,
  writeChatRoom,
  writeChatRoomChatMessagePair,
  writeChatRoomMember,
  writeChatRoomView,
  writeFriend,
  writeSocialPayload,
} from "@common/chat-payloads";
import { BanSummaryPayload } from "@common/profile-payloads";
import { ByteBuffer, NULL_UUID, assert } from "akasha-lib";

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

export function makeFriendRequest(accountId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.FRIEND_REQUEST);
  buf.writeUUID(accountId);
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
  targetAccountId: string,
  entry: FriendEntry,
) {
  const buf = ByteBuffer.createWithOpcode(
    ChatClientOpcode.MODIFY_FRIEND_RESULT,
  );
  buf.write1(FriendErrorNumber.SUCCESS);
  buf.writeUUID(targetAccountId);
  writeFriend(entry, buf);
  return buf;
}

export function makeUpdateFriendActiveStatus(accountId: string) {
  const buf = ByteBuffer.createWithOpcode(
    ChatClientOpcode.UPDATE_FRIEND_ACTIVE_STATUS,
  );
  buf.writeUUID(accountId);
  return buf;
}

export function makeDeleteFriendFailedResult(errno: FriendErrorNumber) {
  assert(errno !== FriendErrorNumber.SUCCESS);

  const buf = ByteBuffer.createWithOpcode(
    ChatClientOpcode.DELETE_FRIEND_RESULT,
  );
  buf.write1(errno);
  return buf;
}

export function makeDeleteFriendSuccessResult(
  targetAccountId: string,
  half: boolean,
) {
  const buf = ByteBuffer.createWithOpcode(
    ChatClientOpcode.DELETE_FRIEND_RESULT,
  );
  buf.write1(FriendErrorNumber.SUCCESS);
  buf.writeUUID(targetAccountId);
  buf.writeBoolean(half);
  return buf;
}

export function makePublicRoomList(chatRoomViewList: ChatRoomViewEntry[]) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.PUBLIC_ROOM_LIST);
  buf.writeArray(chatRoomViewList, writeChatRoomView);
  return buf;
}

export function makeInsertRoom(
  room: ChatRoomEntry,
  messages: ChatMessageEntry[],
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.INSERT_ROOM);
  writeChatRoom(room, buf);
  buf.writeArray(messages, writeChatMessage);
  return buf;
}

export function makeCreateRoomResult(
  errno: RoomErrorNumber,
  chatId: string | null,
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.CREATE_ROOM_RESULT);
  buf.write1(errno);
  buf.writeUUID(chatId ?? NULL_UUID);
  return buf;
}

export function makeEnterRoomResult(errno: RoomErrorNumber, chatId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.ENTER_ROOM_RESULT);
  buf.write1(errno);
  buf.writeUUID(chatId);
  return buf;
}

export function makeEnterRoomFailedCauseBanned(
  chatId: string,
  bans: BanSummaryPayload[],
) {
  const buf = makeEnterRoomResult(RoomErrorNumber.ERROR_CHAT_BANNED, chatId);
  buf.writeArray(bans, writeChatBanSummary);
  return buf;
}

export function makeRemoveRoom(chatId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.REMOVE_ROOM);
  buf.writeUUID(chatId);
  return buf;
}

export function makeLeaveRoomResult(errno: RoomErrorNumber, chatId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.LEAVE_ROOM_RESULT);
  buf.write1(errno);
  buf.writeUUID(chatId);
  return buf;
}

export function makeInviteRoomResult(
  errno: RoomErrorNumber,
  chatId: string,
  targetAccountId: string,
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.INVITE_USER_RESULT);
  buf.write1(errno);
  buf.writeUUID(chatId);
  buf.writeUUID(targetAccountId);
  return buf;
}

export function makeInsertRoomMember(
  chatId: string,
  member: ChatRoomMemberEntry,
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.INSERT_ROOM_MEMBER);
  buf.writeUUID(chatId);
  writeChatRoomMember(member, buf);
  return buf;
}

export function makeRemoveRoomMember(chatId: string, memberAccountId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.REMOVE_ROOM_MEMBER);
  buf.writeUUID(chatId);
  buf.writeUUID(memberAccountId);
  return buf;
}

export function makeChatMessagePayload(message: ChatMessageEntry) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.CHAT_MESSAGE);
  writeChatMessage(message, buf);
  return buf;
}

export function makeChatMessageFailed(errno: RoomErrorNumber) {
  assert(errno !== RoomErrorNumber.SUCCESS);

  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.SEND_MESSAGE_FAILED);
  buf.write1(errno);
  return buf;
}

export function makeChatMessageFailedCauseBanned(bans: BanSummaryPayload[]) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.SEND_MESSAGE_FAILED);
  buf.write1(RoomErrorNumber.ERROR_CHAT_BANNED);
  buf.writeArray(bans, writeChatBanSummary);
  return buf;
}

export function makeSyncCursorPayload(pair: ChatRoomChatMessagePairEntry) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.SYNC_CURSOR);
  writeChatRoomChatMessagePair(pair, buf);
  return buf;
}

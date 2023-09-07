import { ChatClientOpcode } from "@common/chat-opcodes";
import {
  ChatBanDetailEntry,
  ChatBanSummaryEntry,
  ChatMessageEntry,
  ChatRoomChatMessagePairEntry,
  ChatRoomEntry,
  ChatRoomMemberEntry,
  ChatRoomViewEntry,
  EnemyEntry,
  FriendEntry,
  ChatErrorNumber,
  SocialErrorNumber,
  SocialPayload,
  writeChatBanDetail,
  writeChatBanSummary,
  writeChatMessage,
  writeChatRoom,
  writeChatRoomChatMessagePair,
  writeChatRoomMember,
  writeChatRoomView,
  writeEnemy,
  writeFriend,
  writeSocialPayload,
  ChatDirectEntry,
  writeChatDirect,
} from "@common/chat-payloads";
import { BanSummaryPayload } from "@common/profile-payloads";
import { RoleNumber } from "@common/generated/types";
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

export function makeAddFriendFailedResult(errno: SocialErrorNumber) {
  assert(errno !== SocialErrorNumber.SUCCESS);

  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.ADD_FRIEND_RESULT);
  buf.write1(errno);
  return buf;
}

export function makeAddFriendSuccessResult(entry: FriendEntry) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.ADD_FRIEND_RESULT);
  buf.write1(SocialErrorNumber.SUCCESS);
  writeFriend(entry, buf);
  return buf;
}

export function makeFriendRequest(accountId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.FRIEND_REQUEST);
  buf.writeUUID(accountId);
  return buf;
}

export function makeModifyFriendFailedResult(errno: SocialErrorNumber) {
  assert(errno !== SocialErrorNumber.SUCCESS);

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
  buf.write1(SocialErrorNumber.SUCCESS);
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

export function makeDeleteFriendFailedResult(errno: SocialErrorNumber) {
  assert(errno !== SocialErrorNumber.SUCCESS);

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
  buf.write1(SocialErrorNumber.SUCCESS);
  buf.writeUUID(targetAccountId);
  buf.writeBoolean(half);
  return buf;
}

export function makeAddEnemyFailedResult(errno: SocialErrorNumber) {
  assert(errno !== SocialErrorNumber.SUCCESS);

  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.ADD_ENEMY_RESULT);
  buf.write1(errno);
  return buf;
}

export function makeAddEnemySuccessResult(entry: EnemyEntry) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.ADD_ENEMY_RESULT);
  buf.write1(SocialErrorNumber.SUCCESS);
  writeEnemy(entry, buf);
  return buf;
}

export function makeModifyEnemyFailedResult(errno: SocialErrorNumber) {
  assert(errno !== SocialErrorNumber.SUCCESS);

  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.MODIFY_ENEMY_RESULT);
  buf.write1(errno);
  return buf;
}

export function makeModifyEnemySuccessResult(
  targetAccountId: string,
  entry: EnemyEntry,
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.MODIFY_ENEMY_RESULT);
  buf.write1(SocialErrorNumber.SUCCESS);
  buf.writeUUID(targetAccountId);
  writeEnemy(entry, buf);
  return buf;
}

export function makeDeleteEnemyFailedResult(errno: SocialErrorNumber) {
  assert(errno !== SocialErrorNumber.SUCCESS);

  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.DELETE_ENEMY_RESULT);
  buf.write1(errno);
  return buf;
}

export function makeDeleteEnemySuccessResult(targetAccountId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.DELETE_ENEMY_RESULT);
  buf.write1(SocialErrorNumber.SUCCESS);
  buf.writeUUID(targetAccountId);
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
  errno: ChatErrorNumber,
  chatId: string | null,
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.CREATE_ROOM_RESULT);
  buf.write1(errno);
  buf.writeUUID(chatId ?? NULL_UUID);
  return buf;
}

export function makeEnterRoomResult(errno: ChatErrorNumber, chatId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.ENTER_ROOM_RESULT);
  buf.write1(errno);
  buf.writeUUID(chatId);
  return buf;
}

export function makeEnterRoomFailedCauseBanned(
  chatId: string,
  bans: BanSummaryPayload[],
) {
  const buf = makeEnterRoomResult(ChatErrorNumber.ERROR_CHAT_BANNED, chatId);
  buf.writeArray(bans, writeChatBanSummary);
  return buf;
}

export function makeUpdateRoom(room: ChatRoomViewEntry) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.UPDATE_ROOM);
  writeChatRoomView(room, buf);
  return buf;
}

export function makeRemoveRoom(chatId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.REMOVE_ROOM);
  buf.writeUUID(chatId);
  return buf;
}

export function makeLeaveRoomResult(errno: ChatErrorNumber, chatId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.LEAVE_ROOM_RESULT);
  buf.write1(errno);
  buf.writeUUID(chatId);
  return buf;
}

export function makeInviteRoomResult(
  errno: ChatErrorNumber,
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

export function makeUpdateRoomMember(
  chatId: string,
  member: ChatRoomMemberEntry,
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.UPDATE_ROOM_MEMBER);
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

export function makeSendMessageResult(errno: ChatErrorNumber, chatId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.SEND_MESSAGE_RESULT);
  buf.write1(errno);
  buf.writeUUID(chatId);
  return buf;
}

export function makeSendMessageFailedCauseBanned(
  chatId: string,
  bans: BanSummaryPayload[],
) {
  const buf = makeSendMessageResult(ChatErrorNumber.ERROR_CHAT_BANNED, chatId);
  buf.writeArray(bans, writeChatBanSummary);
  return buf;
}

export function makeSyncCursorPayload(pair: ChatRoomChatMessagePairEntry) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.SYNC_CURSOR);
  writeChatRoomChatMessagePair(pair, buf);
  return buf;
}

export function makeChangeRoomPropertyResult(
  errno: ChatErrorNumber,
  chatId: string,
) {
  const buf = ByteBuffer.createWithOpcode(
    ChatClientOpcode.CHANGE_ROOM_PROPERTY_RESULT,
  );
  buf.write1(errno);
  buf.writeUUID(chatId);
  return buf;
}

export function makeChangeMemberRoleResult(
  errno: ChatErrorNumber,
  chatId: string,
  targetAccountId: string,
  targetRole: RoleNumber,
) {
  const buf = ByteBuffer.createWithOpcode(
    ChatClientOpcode.CHANGE_MEMBER_ROLE_RESULT,
  );
  buf.write1(errno);
  buf.writeUUID(chatId);
  buf.writeUUID(targetAccountId);
  buf.write1(targetRole);
  return buf;
}

export function makeHandoverRoomOwnerResult(
  errno: ChatErrorNumber,
  chatId: string,
  targetAccountId: string,
) {
  const buf = ByteBuffer.createWithOpcode(
    ChatClientOpcode.HANDOVER_ROOM_OWNER_RESULT,
  );
  buf.write1(errno);
  buf.writeUUID(chatId);
  buf.writeUUID(targetAccountId);
  return buf;
}

export function makeKickMemberResult(errno: ChatErrorNumber, chatId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.KICK_MEMBER_RESULT);
  buf.write1(errno);
  buf.writeUUID(chatId);
  return buf;
}

export function makeKickNotify(chatId: string, ban: ChatBanSummaryEntry) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.KICK_NOTIFY);
  buf.writeUUID(chatId);
  writeChatBanSummary(ban, buf);
  return buf;
}

export function makeMuteMemberResult(errno: ChatErrorNumber, chatId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.MUTE_MEMBER_RESULT);
  buf.write1(errno);
  buf.writeUUID(chatId);
  return buf;
}

export function makeMuteNotify(chatId: string, ban: ChatBanSummaryEntry) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.MUTE_NOTIFY);
  buf.writeUUID(chatId);
  writeChatBanSummary(ban, buf);
  return buf;
}

export function makeBanList(bans: ChatBanDetailEntry[]) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.BAN_LIST);
  buf.writeArray(bans, writeChatBanDetail);
  return buf;
}

export function makeUnbanMemberResult(errno: ChatErrorNumber, banId: string) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.UNBAN_MEMBER_RESULT);
  buf.write1(errno);
  buf.writeString(banId);
  return buf;
}

export function makeDirectsList(
  targetAccountId: string,
  messages: ChatDirectEntry[],
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.DIRECTS_LIST);
  buf.writeUUID(targetAccountId);
  buf.writeArray(messages, writeChatDirect);
  return buf;
}

export function makeChatDirectPayload(message: ChatDirectEntry) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.CHAT_DIRECT);
  writeChatDirect(message, buf);
  return buf;
}

export function makeSendDirectResult(
  errno: ChatErrorNumber,
  targetAccountId: string,
) {
  const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.SEND_DIRECT_RESULT);
  buf.write1(errno);
  buf.writeUUID(targetAccountId);
  return buf;
}

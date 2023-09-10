import { ByteBuffer } from "akasha-lib";
import {
  ChatBanDetailEntry,
  ChatBanSummaryEntry,
  ChatDirectEntry,
  ChatErrorNumber,
  ChatMessageEntry,
  ChatRoomChatMessagePairEntry,
  ChatRoomEntry,
  ChatRoomMemberEntry,
  ChatRoomViewEntry,
  EnemyEntry,
  FriendEntry,
  ReportErrorNumber,
  SocialErrorNumber,
  SocialPayload,
  readChatBanDetail,
  readChatBanSummary,
  readChatDirect,
  readChatMessage,
  readChatRoom,
  readChatRoomChatMessagePair,
  readChatRoomMember,
  readChatRoomView,
  readEnemy,
  readFriend,
  readSocialPayload,
} from "./chat-payloads";
import { RoleNumber } from "./generated/types";

export function handleInitializePayload(
  payload: ByteBuffer,
): [
  chatRoomList: ChatRoomEntry[],
  chatMessageMap: Map<string, ChatMessageEntry[]>,
  directRoomList: ChatDirectEntry[],
  directMessageMap: Map<string, ChatMessageEntry[]>,
  socialPayload: SocialPayload,
] {
  const chatRoomList = payload.readArray(readChatRoom);
  const chatMessageMap = new Map<string, ChatMessageEntry[]>();
  {
    const count = payload.readLength();
    for (let i = 0; i < count; i++) {
      chatMessageMap.set(
        payload.readUUID(),
        payload.readArray(readChatMessage),
      );
    }
  }
  const directRoomList = payload.readArray(readChatDirect);
  const directMessageMap = new Map<string, ChatMessageEntry[]>();
  {
    const count = payload.readLength();
    for (let i = 0; i < count; i++) {
      directMessageMap.set(
        payload.readUUID(),
        payload.readArray(readChatMessage),
      );
    }
  }
  const socialPayload = readSocialPayload(payload);
  return [
    chatRoomList,
    chatMessageMap,
    directRoomList,
    directMessageMap,
    socialPayload,
  ];
}

export function handleAddFriendResult(
  payload: ByteBuffer,
): [errno: SocialErrorNumber, entry?: FriendEntry | undefined] {
  const errno: SocialErrorNumber = payload.read1();
  if (errno === SocialErrorNumber.SUCCESS) {
    const entry = readFriend(payload);
    return [errno, entry];
  }
  return [errno];
}

export function handleFriendRequest(payload: ByteBuffer): string {
  const accountId = payload.readUUID();
  return accountId;
}

export function handleModifyFriendResult(
  payload: ByteBuffer,
): [
  errno: SocialErrorNumber,
  entry?: [targetAccountId: string, entry: FriendEntry] | undefined,
] {
  const errno: SocialErrorNumber = payload.read1();
  if (errno === SocialErrorNumber.SUCCESS) {
    const targetAccountId = payload.readUUID();
    const entry = readFriend(payload);
    return [errno, [targetAccountId, entry]];
  }
  return [errno];
}

export function handleUpdateFriendActiveStatus(payload: ByteBuffer): string {
  const accountId = payload.readUUID();
  return accountId;
}

export function handleDeleteFriendResult(
  payload: ByteBuffer,
): [
  errno: SocialErrorNumber,
  entry?: [targetAccountId: string, half: boolean] | undefined,
] {
  const errno: SocialErrorNumber = payload.read1();
  if (errno === SocialErrorNumber.SUCCESS) {
    const targetAccountId = payload.readUUID();
    const half = payload.readBoolean();
    return [errno, [targetAccountId, half]];
  }
  return [errno];
}

export function handleAddEnemyResult(
  payload: ByteBuffer,
): [errno: SocialErrorNumber, entry?: EnemyEntry | undefined] {
  const errno: SocialErrorNumber = payload.read1();
  if (errno === SocialErrorNumber.SUCCESS) {
    const entry = readEnemy(payload);
    return [errno, entry];
  }
  return [errno];
}

export function handleModifyEnemyResult(
  payload: ByteBuffer,
): [
  errno: SocialErrorNumber,
  entry?: [targetAccountId: string, entry: EnemyEntry] | undefined,
] {
  const errno: SocialErrorNumber = payload.read1();
  if (errno === SocialErrorNumber.SUCCESS) {
    const targetAccountId = payload.readUUID();
    const entry = readEnemy(payload);
    return [errno, [targetAccountId, entry]];
  }
  return [errno];
}

export function handleDeleteEnemyResult(
  payload: ByteBuffer,
): [errno: SocialErrorNumber, targetAccountId?: string | undefined] {
  const errno: SocialErrorNumber = payload.read1();
  if (errno === SocialErrorNumber.SUCCESS) {
    const targetAccountId = payload.readUUID();
    return [errno, targetAccountId];
  }
  return [errno];
}

export function handlePublicRoomList(payload: ByteBuffer): ChatRoomViewEntry[] {
  const chatRoomViewList = payload.readArray(readChatRoomView);
  return chatRoomViewList;
}

export function handleInsertRoom(
  payload: ByteBuffer,
): [room: ChatRoomEntry, messages: ChatMessageEntry[]] {
  const room = readChatRoom(payload);
  const messages = payload.readArray(readChatMessage);
  return [room, messages];
}

export function handleCreateRoomResult(
  payload: ByteBuffer,
): [errno: ChatErrorNumber, chatId: string] {
  const errno: ChatErrorNumber = payload.read1();
  const chatId = payload.readUUID();
  return [errno, chatId];
}

export function handleEnterRoomResult(
  payload: ByteBuffer,
): [
  errno: ChatErrorNumber,
  chatId: string,
  bans?: ChatBanSummaryEntry[] | undefined,
] {
  const errno: ChatErrorNumber = payload.read1();
  const chatId = payload.readUUID();
  if (errno === ChatErrorNumber.ERROR_CHAT_BANNED) {
    const bans = payload.readArray(readChatBanSummary);
    return [errno, chatId, bans];
  }
  return [errno, chatId];
}

export function handleUpdateRoom(payload: ByteBuffer): ChatRoomViewEntry {
  const room = readChatRoomView(payload);
  return room;
}

export function handleRemoveRoom(payload: ByteBuffer): string {
  const chatId = payload.readUUID();
  return chatId;
}

export function handleLeaveRoomResult(
  payload: ByteBuffer,
): [errno: ChatErrorNumber, chatId: string] {
  const errno: ChatErrorNumber = payload.read1();
  const chatId = payload.readUUID();
  return [errno, chatId];
}

export function handleInviteRoomResult(
  payload: ByteBuffer,
): [errno: ChatErrorNumber, chatId: string, targetAccountId: string] {
  const errno: ChatErrorNumber = payload.read1();
  const chatId = payload.readUUID();
  const targetAccountId = payload.readUUID();
  return [errno, chatId, targetAccountId];
}

export function handleInsertRoomMember(
  payload: ByteBuffer,
): [chatId: string, member: ChatRoomMemberEntry] {
  const chatId = payload.readUUID();
  const member = readChatRoomMember(payload);
  return [chatId, member];
}

export function handleUpdateRoomMember(
  payload: ByteBuffer,
): [chatId: string, member: ChatRoomMemberEntry] {
  const chatId = payload.readUUID();
  const member = readChatRoomMember(payload);
  return [chatId, member];
}

export function handleRemoveRoomMember(
  payload: ByteBuffer,
): [chatId: string, memberAccountId: string] {
  const chatId = payload.readUUID();
  const memberAccountId = payload.readUUID();
  return [chatId, memberAccountId];
}

export function handleChatMessagePayload(
  payload: ByteBuffer,
): ChatMessageEntry {
  const message = readChatMessage(payload);
  return message;
}

export function handleSendMessageResult(
  payload: ByteBuffer,
): [
  errno: ChatErrorNumber,
  chatId: string,
  bans?: ChatBanSummaryEntry[] | undefined,
] {
  const errno: ChatErrorNumber = payload.read1();
  const chatId = payload.readUUID();
  if (errno === ChatErrorNumber.ERROR_CHAT_BANNED) {
    const bans = payload.readArray(readChatBanSummary);
    return [errno, chatId, bans];
  }
  return [errno, chatId];
}

export function handleSyncCursorPayload(
  payload: ByteBuffer,
): ChatRoomChatMessagePairEntry {
  const pair = readChatRoomChatMessagePair(payload);
  return pair;
}

export function handleChangeRoomPropertyResult(
  payload: ByteBuffer,
): [errno: ChatErrorNumber, chatId: string] {
  const errno: ChatErrorNumber = payload.read1();
  const chatId = payload.readUUID();
  return [errno, chatId];
}

export function handleChangeMemberRoleResult(
  payload: ByteBuffer,
): [
  errno: ChatErrorNumber,
  chatId: string,
  targetAccountId: string,
  targetRole: RoleNumber,
] {
  const errno: ChatErrorNumber = payload.read1();
  const chatId = payload.readUUID();
  const targetAccountId = payload.readUUID();
  const targetRole: RoleNumber = payload.read1();
  return [errno, chatId, targetAccountId, targetRole];
}

export function handleHandoverRoomOwnerResult(
  payload: ByteBuffer,
): [errno: ChatErrorNumber, chatId: string, targetAccountId: string] {
  const errno: ChatErrorNumber = payload.read1();
  const chatId = payload.readUUID();
  const targetAccountId = payload.readUUID();
  return [errno, chatId, targetAccountId];
}

export function handleKickMemberResult(
  payload: ByteBuffer,
): [errno: ChatErrorNumber, chatId: string, targetAccountId: string] {
  const errno: ChatErrorNumber = payload.read1();
  const chatId = payload.readUUID();
  const targetAccountId = payload.readUUID();
  return [errno, chatId, targetAccountId];
}

export function handleKickNotify(
  payload: ByteBuffer,
): [chatId: string, ban: ChatBanSummaryEntry] {
  const chatId = payload.readUUID();
  const ban = readChatBanSummary(payload);
  return [chatId, ban];
}

export function handleMuteMemberResult(
  payload: ByteBuffer,
): [errno: ChatErrorNumber, chatId: string, targetAccountId: string] {
  const errno: ChatErrorNumber = payload.read1();
  const chatId = payload.readUUID();
  const targetAccountId = payload.readUUID();
  return [errno, chatId, targetAccountId];
}

export function handleMuteNotify(
  payload: ByteBuffer,
): [chatId: string, ban: ChatBanSummaryEntry] {
  const chatId = payload.readUUID();
  const ban = readChatBanSummary(payload);
  return [chatId, ban];
}

export function handleBanList(payload: ByteBuffer): ChatBanDetailEntry[] {
  const bans = payload.readArray(readChatBanDetail);
  return bans;
}

export function handleUnbanMemberResult(
  payload: ByteBuffer,
): [errno: ChatErrorNumber, banId: string] {
  const errno: ChatErrorNumber = payload.read1();
  const banId = payload.readString(); //NOTE: nanoId
  return [errno, banId];
}

export function handleDestroyRoomResult(
  payload: ByteBuffer,
): [errno: ChatErrorNumber, chatId: string] {
  const errno: ChatErrorNumber = payload.read1();
  const chatId = payload.readUUID();
  return [errno, chatId];
}

export function handleChatDirectPayload(
  payload: ByteBuffer,
): [targetAccountId: string, message: ChatMessageEntry] {
  const targetAccountId = payload.readUUID();
  const message = readChatMessage(payload);
  return [targetAccountId, message];
}

export function handleSyncCursorDirectPayload(
  payload: ByteBuffer,
): ChatRoomChatMessagePairEntry {
  const pair = readChatRoomChatMessagePair(payload);
  return pair;
}

export function handleSendDirectResult(
  payload: ByteBuffer,
): [errno: ChatErrorNumber, targetAccountId: string] {
  const errno: ChatErrorNumber = payload.read1();
  const targetAccountId = payload.readUUID();
  return [errno, targetAccountId];
}

export function handleReportResult(
  payload: ByteBuffer,
): [errno: ReportErrorNumber, targetAccountId: string] {
  const errno: ReportErrorNumber = payload.read1();
  const targetAccountId = payload.readUUID();
  return [errno, targetAccountId];
}

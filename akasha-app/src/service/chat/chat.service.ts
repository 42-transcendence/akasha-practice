import { PrismaService } from "@/prisma/prisma.service";
import { Injectable, Logger } from "@nestjs/common";
import {
  ChatMessageEntry,
  ChatRoomChatMessagePairEntry,
  ChatRoomEntry,
  ChatRoomMemberEntry,
  ChatRoomViewEntry,
  FRIEND_ACTIVE_FLAGS_SIZE,
  FriendEntry,
  FriendErrorNumber,
  RoomErrorNumber,
  SocialPayload,
} from "@common/chat-payloads";
import { AccountsService } from "@/user/accounts/accounts.service";
import {
  ActiveStatus,
  BanCategory,
  ChatBan,
  ChatMember,
  Friend,
  Prisma,
} from "@prisma/client";
import {
  ActiveStatusNumber,
  MessageTypeNumber,
  RoleNumber,
  getActiveStatusFromNumber,
  getActiveStatusNumber,
  getMessageTypeFromNumber,
  getMessageTypeNumber,
  getRoleFromNumber,
  getRoleNumber,
} from "@common/generated/types";
import { fromBitsString, toBitsString } from "akasha-lib";

/// FriendForEntry
function toFriendEntry(friend: Friend): FriendEntry {
  return {
    ...friend,
    activeFlags: fromBitsString(friend.activeFlags, FRIEND_ACTIVE_FLAGS_SIZE),
  };
}

/// ChatMemberForEntry
const chatMemberForEntry = Prisma.validator<Prisma.ChatMemberDefaultArgs>()({
  select: {
    accountId: true,
    role: true,
  },
});
type ChatMemberForEntry = Prisma.ChatMemberGetPayload<
  typeof chatMemberForEntry
>;

function toChatMemberEntry(member: ChatMemberForEntry): ChatRoomMemberEntry {
  return {
    ...member,
    role: getRoleNumber(member.role),
  };
}

/// ChatRoomForEntry
const chatRoomForEntry = Prisma.validator<Prisma.ChatDefaultArgs>()({
  include: {
    members: chatMemberForEntry,
  },
});
type ChatRoomForEntry = Prisma.ChatGetPayload<typeof chatRoomForEntry>;

function toChatRoomEntry(
  chat: ChatRoomForEntry,
  lastMessageId: string | null = null,
): ChatRoomEntry {
  return {
    ...chat,
    members: chat.members.map((e) => toChatMemberEntry(e)),
    lastMessageId: lastMessageId,
  };
}

/// ChatMemberWithRoom
const chatMemberWithRoom = Prisma.validator<Prisma.ChatMemberDefaultArgs>()({
  include: {
    chat: chatRoomForEntry,
  },
});
type ChatMemberWithRoom = Prisma.ChatMemberGetPayload<
  typeof chatMemberWithRoom
>;

/// FriendResult
type FriendResult =
  | { errno: FriendErrorNumber.SUCCESS; friend: FriendEntry }
  | { errno: Exclude<FriendErrorNumber, FriendErrorNumber.SUCCESS> };

/// ChatCreateRoomResult
type ChatCreateRoomResult =
  | { errno: RoomErrorNumber.SUCCESS; room: ChatRoomEntry }
  | { errno: Exclude<RoomErrorNumber, RoomErrorNumber.SUCCESS> };

/// ChatEnterRoomResult
type ChatEnterRoomResult =
  | {
      errno: RoomErrorNumber.SUCCESS;
      room: ChatRoomEntry;
      member: ChatRoomMemberEntry;
    }
  | { errno: Exclude<RoomErrorNumber, RoomErrorNumber.SUCCESS> };

/// ChatLeaveRoomResult
type ChatLeaveRoomResult =
  | {
      errno: RoomErrorNumber.SUCCESS;
      member: ChatRoomMemberEntry;
    }
  | { errno: Exclude<RoomErrorNumber, RoomErrorNumber.SUCCESS> };

@Injectable()
export class ChatService {
  protected static readonly logger = new Logger(ChatService.name);

  protected static logUnknownError(e: any) {
    if (e instanceof Error) {
      ChatService.logger.error(e.name);
      ChatService.logger.error(e.message, e.stack);
    } else {
      ChatService.logger.error(e);
    }
  }

  private readonly memberCache = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  // forward
  async getAccountIdByNick(name: string, tag: number) {
    return this.accounts.findAccountIdByNick(name, tag);
  }

  // forward
  async getActiveStatus(accountId: string) {
    const activeStatusRaw = await this.accounts.findActiveStatus(accountId);
    return activeStatusRaw !== null
      ? getActiveStatusNumber(activeStatusRaw)
      : null;
  }

  // forward
  async setActiveStatus(accountId: string, activeStatus: ActiveStatusNumber) {
    return this.accounts.updateActiveStatus(
      accountId,
      getActiveStatusFromNumber(activeStatus),
    );
  }

  // forward
  async setActiveTimestamp(accountId: string, force: boolean) {
    return this.accounts.updateActiveTimestamp(
      accountId,
      force ? undefined : ActiveStatus.INVISIBLE,
    );
  }

  async loadJoinedRoomList(accountId: string): Promise<ChatRoomEntry[]> {
    const data = await this.prisma.chatMember.findMany({
      where: { accountId },
      select: {
        chat: chatRoomForEntry,
        lastMessageId: true,
      },
    });

    return data.map((e) => toChatRoomEntry(e.chat, e.lastMessageId));
  }

  async loadMessagesAfter(
    chatId: string,
    lastMessageId: string | undefined,
  ): Promise<ChatMessageEntry[]> {
    const data = await this.prisma.chatMessage.findMany({
      where: { chat: { id: chatId } },
      orderBy: { timestamp: Prisma.SortOrder.asc },
      ...(lastMessageId !== undefined
        ? {
            skip: 1,
            cursor: { id: lastMessageId },
          }
        : {}),
    });

    return data.map((e) => ({
      ...e,
      messageType: getMessageTypeNumber(e.messageType),
    }));
  }

  async loadSocial(accountId: string): Promise<SocialPayload> {
    const data = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        friends: true,
        friendReferences: {
          select: {
            accountId: true,
          },
        },
        enemies: {
          select: {
            enemyAccountId: true,
            memo: true,
          },
        },
      },
    });

    const friendList = data.friends.map((e) => toFriendEntry(e));

    const friendUUIDSet = new Set<string>(
      data.friends.map((e) => e.friendAccountId),
    );
    const friendRequestList = data.friendReferences
      .map((e) => e.accountId)
      .filter((e) => !friendUUIDSet.has(e));

    const enemyList = data.enemies;

    return { friendList, friendRequestList, enemyList };
  }

  async addFriend(
    accountId: string,
    targetAccountId: string | null,
    groupName: string,
    activeFlags: number,
  ): Promise<FriendResult> {
    if (targetAccountId === null) {
      return { errno: FriendErrorNumber.ERROR_LOOKUP_FAILED };
    }
    if (targetAccountId === accountId) {
      return { errno: FriendErrorNumber.ERROR_SELF_FRIEND };
    }
    let data: Friend;
    try {
      data = await this.prisma.friend.create({
        data: {
          account: { connect: { id: accountId } },
          friendAccount: { connect: { id: targetAccountId } },
          groupName,
          activeFlags: toBitsString(activeFlags, FRIEND_ACTIVE_FLAGS_SIZE),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") {
          return { errno: FriendErrorNumber.ERROR_ALREADY_FRIEND };
        }
      }
      ChatService.logUnknownError(e);
      return { errno: FriendErrorNumber.ERROR_UNKNOWN };
    }
    return {
      errno: FriendErrorNumber.SUCCESS,
      friend: toFriendEntry(data),
    };
  }

  async modifyFriend(
    accountId: string,
    targetAccountId: string,
    groupName: string | undefined,
    activeFlags: number | undefined,
  ): Promise<FriendResult> {
    let data: Friend;
    try {
      data = await this.prisma.friend.update({
        data: {
          groupName,
          activeFlags:
            activeFlags !== undefined
              ? toBitsString(activeFlags, FRIEND_ACTIVE_FLAGS_SIZE)
              : undefined,
        },
        where: {
          accountId_friendAccountId: {
            accountId,
            friendAccountId: targetAccountId,
          },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          return { errno: FriendErrorNumber.ERROR_NOT_FRIEND };
        }
      }
      ChatService.logUnknownError(e);
      return { errno: FriendErrorNumber.ERROR_UNKNOWN };
    }
    return {
      errno: FriendErrorNumber.SUCCESS,
      friend: toFriendEntry(data),
    };
  }

  async deleteFriend(
    accountId: string,
    targetAccountId: string,
  ): Promise<
    [FriendErrorNumber, FriendEntry | undefined, FriendEntry | undefined]
  > {
    //XXX: Prisma가 DELETE RETURNING을 deleteMany에서 지원하지 않았음.
    //XXX: Prisma가 DeleteUniqueIfExists 따위를 지원하지 않았음.
    let data: [Friend | null, Friend | null, unknown];
    try {
      data = await this.prisma.$transaction([
        this.prisma.friend.findUnique({
          where: {
            accountId_friendAccountId: {
              accountId: accountId,
              friendAccountId: targetAccountId,
            },
          },
        }),
        this.prisma.friend.findUnique({
          where: {
            accountId_friendAccountId: {
              friendAccountId: accountId,
              accountId: targetAccountId,
            },
          },
        }),
        this.prisma.friend.deleteMany({
          where: {
            OR: [
              {
                accountId: accountId,
                friendAccountId: targetAccountId,
              },
              {
                friendAccountId: accountId,
                accountId: targetAccountId,
              },
            ],
          },
        }),
      ]);
    } catch (e) {
      ChatService.logUnknownError(e);
      return [FriendErrorNumber.ERROR_UNKNOWN, undefined, undefined];
    }
    const [forward, reverse] = data;
    if (forward !== null || reverse !== null) {
      return [FriendErrorNumber.ERROR_NOT_FRIEND, undefined, undefined];
    }
    return [
      FriendErrorNumber.SUCCESS,
      forward !== null ? toFriendEntry(forward) : undefined,
      reverse !== null ? toFriendEntry(reverse) : undefined,
    ];
  }

  async isDuplexFriend(
    accountId: string,
    targetAccountId: string,
  ): Promise<boolean> {
    const data = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        friends: {
          select: { friendAccountId: true },
          where: { friendAccount: { id: targetAccountId } },
        },
        friendReferences: {
          select: { accountId: true },
          where: { account: { id: targetAccountId } },
        },
      },
    });
    return (
      data !== null &&
      data.friends.length !== 0 &&
      data.friendReferences.length !== 0
    );
  }

  async getDuplexFriends(accountId: string): Promise<FriendEntry[]> {
    const data = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        friends: { select: { friendAccountId: true } },
        friendReferences: true,
      },
    });

    const forward = new Set<string>(data.friends.map((e) => e.friendAccountId));

    return data.friendReferences
      .filter((e) => forward.has(e.accountId))
      .map((e) => toFriendEntry(e));
  }

  async loadPublicRoomList(): Promise<ChatRoomViewEntry[]> {
    const data = await this.prisma.chat.findMany({
      where: { isPrivate: false },
      include: { members: { select: { chatId: true, accountId: true } } },
    });

    return data.map((e) => ({
      ...e,
      memberCount: e.members.length,
    }));
  }

  //FIXME: 공통 루틴은 트랜잭션을 통해서 호출할 수 있는 함수(insert(tx, ...), remove(tx, ...)), sendChatMessage(tx?, ...)로 분리하여 만들고,
  //TODO: 상세한 루틴 create(...), enter(...), leave(...), invite(...), kick(...)에 대하여 더 자세한 구현은 매번 함수를 만든다.
  /**
방을 만드려고 한다.
 [SUCCESS]					 - 성공했습니다.
 [ERROR_ACCOUNT_BAN]		 - 당신은 방을 만들 수 없습니다. (계정의 활동정지의 의미)
 [ERROR_UNKNOWN]			 - 알 수 없는 오류로 실패했습니다. (DB Fail)

방에 입장하려고 한다.
 [SUCCESS]					 - 성공했습니다.
 [ERROR_ACCOUNT_BAN]		 - 당신은 방에 입장할 수 없습니다. (계정의 활동정지의 의미)
 [ERROR_NO_ROOM]			 - (서버 전체에) 존재하지 않는 방입니다.
 [ERROR_ALREADY_ROOM_MEMBER] - 이미 들어와 있는 방입니다.
 [ERROR_WRONG_PASSWORD]		 - 비밀번호가 틀렸습니다.
 [ERROR_EXCEED_LIMIT]		 - 꽉찬 방입니다.
 [ERROR_CHAT_BANNED]		 - 방에서 정지당했습니다. [이유도 포함]
 [ERROR_UNKNOWN]			 - 알 수 없는 오류로 실패했습니다. (DB Fail)

방에 초대하려고 한다.
 [SUCCESS]					 - 성공했습니다.
 [ERROR_ACCOUNT_BAN]		 - 당신은 방에 누군가를 초대할 수 없습니다. (계정의 활동정지의 의미)
 [ERROR_NO_ROOM]			 - (내 목록에) 존재하지 않는 방입니다.
 [ERROR_ALREADY_ROOM_MEMBER] - (대상이) 이미 들어와 있는 방입니다.
 [ERROR_ENEMY]				 - 대상이 나를 차단했습니다.
 [ERROR_PERMISSION]			 - 비밀번호가 틀렸습니다. (관리자가 아니라서 비밀번호를 알 수 없습니다)
 [ERROR_EXCEED_LIMIT]		 - 꽉찬 방입니다.
 [ERROR_CHAT_BANNED]		 - (대상이) 방에서 정지당했습니다. [이유도 포함]
 [ERROR_UNKNOWN]			 - 알 수 없는 오류로 실패했습니다. (DB Fail)

방에서 퇴장하려고 한다.
 [SUCCESS]					 - 성공했습니다.
 [ERROR_ACCOUNT_BAN]		 - 당신은 방에서 나갈 수 없습니다. (계정의 활동정지의 의미)
 [ERROR_NO_ROOM]			 - (내 목록에) 존재하지 않는 방입니다.
 [ERROR_RESTRICTED]			 - 방장은 나갈 수 없습니다.
 [ERROR_UNKNOWN]			 - 알 수 없는 오류로 실패했습니다. (DB Fail)

방에서 강퇴하려고 한다.
 [SUCCESS]					 - 성공했습니다.
 [ERROR_ACCOUNT_BAN]		 - 당신은 누군가를 강퇴할 수 없습니다. (계정의 활동정지의 의미)
 [ERROR_PERMISSION]			 - 관리자가 아니어서 강퇴할 권한이 없습니다.
 [ERROR_NO_ROOM]			 - (내 목록에) 존재하지 않는 방입니다.
 [ERROR_NO_MEMBER]			 - 방에 존재하지 않는 멤버입니다.
 [ERROR_RESTRICTED]			 - 나보다 상위 수준의 멤버를 강퇴할 수 없습니다.
 [ERROR_SELF]				 - 스스로를 강퇴할 수 없습니다.
 [ERROR_UNKNOWN]			 - 알 수 없는 오류로 실패했습니다. (DB Fail)

방에서 나가진 이유 (신규 옵코드 필요!! (보내기 전용))
 - 평범하게 나갔습니다. (아무것도 안보낸다.)
 - 강퇴당했습니다. [이유도 포함]
 - 방이 해체되었습니다.

메시지를 보내려고 한다.
 [SUCCESS]					 - 성공했습니다.
 [ERROR_ACCOUNT_BAN]		 - 당신은 채팅을 보낼 수 없습니다. (계정의 활동정지의 의미)
 [ERROR_NO_ROOM]			 - (내 목록에) 존재하지 않는 방입니다.
 [ERROR_CHAT_BANNED]		 - 방에서 채팅 정지당했습니다. [이유도 포함]
 [ERROR_RESTRICTED]			 - 지금은 보낼 수 없습니다. 잠시 후 다시 시도하세요.
 [ERROR_UNKNOWN]			 - 알 수 없는 오류로 실패했습니다. (DB Fail)

관리자 승급(강등): (신규 옵코드 필요!!)
 [SUCCESS]					 - 성공했습니다.
 [ERROR_ACCOUNT_BAN]		 - 당신은 관리자를 승급(강등)시킬 수 없습니다. (계정의 활동정지의 의미)
 [ERROR_NO_ROOM]			 - (내 목록에) 존재하지 않는 방입니다.
 [ERROR_NO_MEMBER]			 - 방에 존재하지 않는 멤버입니다.
 [ERROR_PERMISSION]			 - 소유자가 아니어서 관리자를 승급(강등)시킬 권한이 없습니다.
 [ERROR_RESTRICTED]			 - 이미 승급(강등)되어 있는 멤버입니다.
 [ERROR_SELF]				 - 스스로를 승급(강등)할 수 없습니다.
 [ERROR_UNKNOWN]			 - 알 수 없는 오류로 실패했습니다. (DB Fail)

채팅방 양도: (신규 옵코드 필요!!)
 [SUCCESS]					 - 성공했습니다.
 [ERROR_ACCOUNT_BAN]		 - 당신은 채팅방을 양도할 수 없습니다. (계정의 활동정지의 의미)
 [ERROR_NO_ROOM]			 - (내 목록에) 존재하지 않는 방입니다.
 [ERROR_NO_MEMBER]			 - 방에 존재하지 않는 멤버입니다.
 [ERROR_PERMISSION]			 - 소유자가 아니어서 채팅방을 양도할 권한이 없습니다.
 [ERROR_RESTRICTED]			 - 매니저가 아닌 유저에게 채팅방을 양도할 수 없습니다.
 [ERROR_SELF]				 - 스스로에게 양도할 수 없습니다.
 [ERROR_UNKNOWN]			 - 알 수 없는 오류로 실패했습니다. (DB Fail)

채팅방 해체: (신규 옵코드 필요!!)
 [SUCCESS]					 - 성공했습니다.
 [ERROR_ACCOUNT_BAN]		 - 당신은 채팅방을 해체할 수 없습니다. (계정의 활동정지의 의미)
 [ERROR_NO_ROOM]			 - (내 목록에) 존재하지 않는 방입니다.
 [ERROR_PERMISSION]			 - 소유자가 아니어서 채팅방을 해체할 권한이 없습니다.
 [ERROR_RESTRICTED]			 - 나를 제외한 멤버가 남아있으면 채팅방을 해체할 수 없습니다.
 [ERROR_UNKNOWN]			 - 알 수 없는 오류로 실패했습니다. (DB Fail)
  */
  async createNewRoom(
    room: Prisma.ChatCreateInput,
    members: Prisma.ChatMemberCreateManyChatInput[],
  ): Promise<ChatCreateRoomResult> {
    let data: ChatRoomForEntry;
    try {
      data = await this.prisma.chat.create({
        data: {
          ...room,
          members: {
            createMany: { data: members },
          },
        },
        include: {
          ...chatRoomForEntry.include,
          messages: true,
        },
      });
    } catch (e) {
      ChatService.logUnknownError(e);
      return { errno: RoomErrorNumber.ERROR_UNKNOWN };
    }

    const memberSet = new Set<string>(data.members.map((e) => e.accountId));
    this.memberCache.set(data.id, memberSet);

    return {
      errno: RoomErrorNumber.SUCCESS,
      room: toChatRoomEntry(data),
    };
  }

  async getChatMemberSet(chatId: string): Promise<Set<string>> {
    const cache = this.memberCache.get(chatId);
    if (cache !== undefined) {
      //NOTE: Implement invalidate cache
      return cache;
    }

    const data = await this.prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      select: { members: { select: { accountId: true } } },
    });

    const memberSet = new Set<string>(data.members.map((e) => e.accountId));
    this.memberCache.set(chatId, memberSet);
    return memberSet;
  }

  async insertChatMember(
    chatId: string,
    accountId: string,
    password: string | null,
    role: RoleNumber,
  ): Promise<ChatEnterRoomResult> {
    void password; //TODO: usage

    let data: ChatMemberWithRoom;
    try {
      data = await this.prisma.chatMember.create({
        ...chatMemberWithRoom,
        data: {
          account: { connect: { id: accountId } },
          chat: { connect: { id: chatId } },
          role: getRoleFromNumber(role),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          // An operation failed because it depends on one or more records that were required but not found. {cause}
          return { errno: RoomErrorNumber.ERROR_ALREADY_ROOM_MEMBER };
        }
      }
      ChatService.logUnknownError(e);
      return { errno: RoomErrorNumber.ERROR_UNKNOWN };
    }

    const cache = this.memberCache.get(chatId);
    if (cache !== undefined) {
      cache.add(accountId);
    }

    return {
      errno: RoomErrorNumber.SUCCESS,
      room: toChatRoomEntry(data.chat),
      member: toChatMemberEntry(data),
    };
  }

  async deleteChatMember(
    chatId: string,
    accountId: string,
  ): Promise<ChatLeaveRoomResult> {
    const cache = this.memberCache.get(chatId);
    if (cache !== undefined) {
      cache.delete(accountId);
    }

    let data: ChatMember;
    try {
      data = await this.prisma.chatMember.delete({
        where: { chatId_accountId: { chatId, accountId } },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          return { errno: RoomErrorNumber.ERROR_NO_MEMBER };
        }
      }
      ChatService.logUnknownError(e);
      return { errno: RoomErrorNumber.ERROR_UNKNOWN };
    }

    return { errno: RoomErrorNumber.SUCCESS, member: toChatMemberEntry(data) };
  }

  async createNewChatMessage(
    chatId: string,
    accountId: string,
    content: string,
    messageType: MessageTypeNumber,
  ): Promise<ChatMessageEntry> {
    const data = await this.prisma.chatMessage.create({
      data: {
        chat: { connect: { id: chatId } },
        account: { connect: { id: accountId } },
        content,
        messageType: getMessageTypeFromNumber(messageType),
      },
    });

    return { ...data, messageType: getMessageTypeNumber(data.messageType) };
  }

  async updateLastMessageCursor(
    accountId: string,
    pair: ChatRoomChatMessagePairEntry,
  ): Promise<void> {
    void (await this.prisma.chatMember.update({
      where: { chatId_accountId: { chatId: pair.chatId, accountId } },
      data: { lastMessageId: pair.messageId },
    }));
  }

  async getChatBanned(
    chatId: string,
    accountId: string,
    category: BanCategory,
  ): Promise<ChatBan[]> {
    const data = await this.prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      select: { bans: { where: { accountId, category } } },
    });

    return data.bans;
  }

  async createChatBan(
    chatId: string,
    targetAccountId: string,
    managerAccountId: string,
    category: BanCategory,
    reason: string,
    memo: string,
    expireTimestamp: Date | null,
  ): Promise<ChatBan> {
    const data = await this.prisma.chatBan.create({
      data: {
        chat: { connect: { id: chatId } },
        account: { connect: { id: targetAccountId } },
        managerAccount: { connect: { id: managerAccountId } },
        category,
        reason,
        memo,
        expireTimestamp,
      },
    });

    return data;
  }

  async deleteChatBan(chatBanId: string): Promise<ChatBan> {
    const data = await this.prisma.chatBan.delete({
      where: { id: chatBanId },
    });

    return data;
  }

  async isChatBanned(roomUUID: string, accountId: string, type: BanCategory) {
    const data = await this.getChatBanned(roomUUID, accountId, type);

    //FIXME: 임시
    return data.length !== 0;
  }
}

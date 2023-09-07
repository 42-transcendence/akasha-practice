import {
  PrismaService,
  PrismaTransactionClient,
} from "@/prisma/prisma.service";
import { Injectable, Logger } from "@nestjs/common";
import {
  ChatBanDetailEntry,
  ChatBanSummaryEntry,
  ChatMessageEntry,
  ChatRoomChatMessagePairEntry,
  ChatRoomEntry,
  ChatRoomMemberEntry,
  ChatRoomViewEntry,
  EnemyEntry,
  FRIEND_ACTIVE_FLAGS_SIZE,
  FriendEntry,
  RoomErrorNumber,
  SocialErrorNumber,
  SocialPayload,
} from "@common/chat-payloads";
import { AccountsService } from "@/user/accounts/accounts.service";
import {
  ActiveStatus,
  BanCategory,
  Chat,
  ChatBan,
  ChatMember,
  Enemy,
  Friend,
  Prisma,
  Role,
} from "@prisma/client";
import {
  ActiveStatusNumber,
  MessageTypeNumber,
  RoleNumber,
  getActiveStatusFromNumber,
  getActiveStatusNumber,
  getBanCategoryNumber,
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

/// BanForEntry
function toBanSummaryEntry(ban: ChatBan): ChatBanSummaryEntry {
  return {
    ...ban,
    category: getBanCategoryNumber(ban.category),
  };
}

function toBanDetailEntry(ban: ChatBan): ChatBanDetailEntry {
  return {
    ...ban,
    category: getBanCategoryNumber(ban.category),
  };
}

/// FriendResult
type FriendResult =
  | { errno: SocialErrorNumber.SUCCESS; friend: FriendEntry }
  | { errno: Exclude<SocialErrorNumber, SocialErrorNumber.SUCCESS> };

/// EnemyResult
type EnemyResult =
  | { errno: SocialErrorNumber.SUCCESS; enemy: EnemyEntry }
  | { errno: Exclude<SocialErrorNumber, SocialErrorNumber.SUCCESS> };

/// ChatRoomFailed
type ChatRoomFailed =
  | {
      errno: Exclude<
        RoomErrorNumber,
        RoomErrorNumber.SUCCESS | RoomErrorNumber.ERROR_CHAT_BANNED
      >;
    }
  | {
      errno: RoomErrorNumber.ERROR_CHAT_BANNED;
      bans: ChatBanSummaryEntry[] | null;
    };

/// ChatCreateRoomResult
type ChatCreateRoomResult =
  | { errno: RoomErrorNumber.SUCCESS; room: ChatRoomEntry }
  | ChatRoomFailed;

/// ChatEnterRoomResult
type ChatEnterRoomResult =
  | {
      errno: RoomErrorNumber.SUCCESS;
      room: ChatRoomEntry;
      member: ChatRoomMemberEntry;
    }
  | ChatRoomFailed;

/// ChatLeaveRoomResult
type ChatLeaveRoomResult =
  | {
      errno: RoomErrorNumber.SUCCESS;
      chatId: string;
      accountId: string;
    }
  | ChatRoomFailed;

/// ChatBanResult
type ChatBanResult =
  | {
      errno: RoomErrorNumber.SUCCESS;
      chatId: string;
      accountId: string;
      ban: ChatBanSummaryEntry;
    }
  | ChatRoomFailed;

/// ChatMessageResult
type ChatMessageResult =
  | {
      errno: RoomErrorNumber.SUCCESS;
      message: ChatMessageEntry;
    }
  | ChatRoomFailed;

/// ChatMemberResult
type ChatMemberResult =
  | {
      errno: RoomErrorNumber.SUCCESS;
      chatId: string;
      accountId: string;
    }
  | ChatRoomFailed;

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

  private readonly memberCache = new Map<string, Set<string> | null>();

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
    const members = await this.prisma.chatMember.findMany({
      where: { accountId },
      select: {
        chat: chatRoomForEntry,
        lastMessageId: true,
      },
    });

    return members.map((e) => toChatRoomEntry(e.chat, e.lastMessageId));
  }

  async loadMessagesAfter(
    chatId: string,
    lastMessageId: string | undefined,
  ): Promise<ChatMessageEntry[]> {
    const messages = await this.prisma.chatMessage.findMany({
      where: { chat: { id: chatId } },
      orderBy: { timestamp: Prisma.SortOrder.asc },
      ...(lastMessageId !== undefined
        ? {
            skip: 1,
            cursor: { id: lastMessageId },
          }
        : {}),
    });

    return messages.map((e) => ({
      ...e,
      messageType: getMessageTypeNumber(e.messageType),
    }));
  }

  async loadSocial(accountId: string): Promise<SocialPayload> {
    const account = await this.prisma.account.findUniqueOrThrow({
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

    const friendList = account.friends.map((e) => toFriendEntry(e));

    const friendUUIDSet = new Set<string>(
      account.friends.map((e) => e.friendAccountId),
    );
    const friendRequestList = account.friendReferences
      .map((e) => e.accountId)
      .filter((e) => !friendUUIDSet.has(e));

    const enemyList = account.enemies;

    return { friendList, friendRequestList, enemyList };
  }

  async addFriend(
    accountId: string,
    targetAccountId: string | null,
    groupName: string,
    activeFlags: number,
  ): Promise<FriendResult> {
    if (targetAccountId === null) {
      return { errno: SocialErrorNumber.ERROR_LOOKUP_FAILED };
    }
    if (targetAccountId === accountId) {
      return { errno: SocialErrorNumber.ERROR_SELF };
    }
    let friend: Friend;
    try {
      friend = await this.prisma.friend.create({
        data: {
          accountId,
          friendAccountId: targetAccountId,
          groupName,
          activeFlags: toBitsString(activeFlags, FRIEND_ACTIVE_FLAGS_SIZE),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") {
          return { errno: SocialErrorNumber.ERROR_ALREADY_EXISTS };
        }
      }
      ChatService.logUnknownError(e);
      return { errno: SocialErrorNumber.ERROR_UNKNOWN };
    }
    return {
      errno: SocialErrorNumber.SUCCESS,
      friend: toFriendEntry(friend),
    };
  }

  async modifyFriend(
    accountId: string,
    friendAccountId: string,
    groupName: string | undefined,
    activeFlags: number | undefined,
  ): Promise<FriendResult> {
    let friend: Friend;
    try {
      friend = await this.prisma.friend.update({
        data: {
          groupName,
          activeFlags:
            activeFlags !== undefined
              ? toBitsString(activeFlags, FRIEND_ACTIVE_FLAGS_SIZE)
              : undefined,
        },
        where: {
          accountId_friendAccountId: { accountId, friendAccountId },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          return { errno: SocialErrorNumber.ERROR_NOT_FOUND };
        }
      }
      ChatService.logUnknownError(e);
      return { errno: SocialErrorNumber.ERROR_UNKNOWN };
    }
    return {
      errno: SocialErrorNumber.SUCCESS,
      friend: toFriendEntry(friend),
    };
  }

  async deleteFriend(
    accountId: string,
    friendAccountId: string,
  ): Promise<
    [SocialErrorNumber, FriendEntry | undefined, FriendEntry | undefined]
  > {
    //XXX: Prisma가 DELETE RETURNING을 deleteMany에서 지원하지 않았음.
    //XXX: Prisma가 DeleteUniqueIfExists 따위를 지원하지 않았음.
    let data: [Friend | null, Friend | null, unknown];
    try {
      data = await this.prisma.$transaction([
        this.prisma.friend.findUnique({
          where: {
            accountId_friendAccountId: { accountId, friendAccountId },
          },
        }),
        this.prisma.friend.findUnique({
          where: {
            accountId_friendAccountId: {
              friendAccountId: accountId,
              accountId: friendAccountId,
            },
          },
        }),
        this.prisma.friend.deleteMany({
          where: {
            OR: [
              {
                accountId,
                friendAccountId,
              },
              {
                friendAccountId: accountId,
                accountId: friendAccountId,
              },
            ],
          },
        }),
      ]);
    } catch (e) {
      ChatService.logUnknownError(e);
      return [SocialErrorNumber.ERROR_UNKNOWN, undefined, undefined];
    }
    const [forward, reverse] = data;
    if (forward !== null || reverse !== null) {
      return [SocialErrorNumber.ERROR_NOT_FOUND, undefined, undefined];
    }
    return [
      SocialErrorNumber.SUCCESS,
      forward !== null ? toFriendEntry(forward) : undefined,
      reverse !== null ? toFriendEntry(reverse) : undefined,
    ];
  }

  async isDuplexFriend(
    accountId: string,
    friendAccountId: string,
    tx?: PrismaTransactionClient | undefined,
  ): Promise<boolean> {
    tx ??= this.prisma;
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: {
        friends: {
          select: { friendAccountId: true },
          where: { friendAccountId: friendAccountId },
        },
        friendReferences: {
          select: { accountId: true },
          where: { accountId: friendAccountId },
        },
        enemyReferences: {
          select: { accountId: true },
          where: { accountId: friendAccountId },
        },
      },
    });
    return (
      account !== null &&
      account.friends.length !== 0 &&
      account.friendReferences.length !== 0 &&
      account.enemyReferences.length === 0
    );
  }

  async getDuplexFriends(
    accountId: string,
    tx?: PrismaTransactionClient | undefined,
  ): Promise<FriendEntry[]> {
    tx ??= this.prisma;
    const account = await tx.account.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        friends: true,
        friendReferences: { select: { accountId: true } },
        enemyReferences: { select: { accountId: true } },
      },
    });

    const reverses = new Set<string>(
      account.friendReferences.map((e) => e.accountId),
    );
    const reverseEnemies = new Set<string>(
      account.enemyReferences.map((e) => e.accountId),
    );

    return account.friends
      .filter((e) => reverses.has(e.friendAccountId))
      .filter((e) => !reverseEnemies.has(e.friendAccountId))
      .map((e) => toFriendEntry(e));
  }

  async addEnemy(
    accountId: string,
    targetAccountId: string | null,
    memo: string,
  ): Promise<EnemyResult> {
    if (targetAccountId === null) {
      return { errno: SocialErrorNumber.ERROR_LOOKUP_FAILED };
    }
    if (targetAccountId === accountId) {
      return { errno: SocialErrorNumber.ERROR_SELF };
    }
    let enemy: Enemy;
    try {
      enemy = await this.prisma.enemy.create({
        data: {
          accountId,
          enemyAccountId: targetAccountId,
          memo,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") {
          return { errno: SocialErrorNumber.ERROR_ALREADY_EXISTS };
        }
      }
      ChatService.logUnknownError(e);
      return { errno: SocialErrorNumber.ERROR_UNKNOWN };
    }
    return {
      errno: SocialErrorNumber.SUCCESS,
      enemy,
    };
  }

  async modifyEnemy(
    accountId: string,
    enemyAccountId: string,
    memo: string | undefined,
  ): Promise<EnemyResult> {
    let enemy: Enemy;
    try {
      enemy = await this.prisma.enemy.update({
        data: {
          memo,
        },
        where: {
          accountId_enemyAccountId: { accountId, enemyAccountId },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          return { errno: SocialErrorNumber.ERROR_NOT_FOUND };
        }
      }
      ChatService.logUnknownError(e);
      return { errno: SocialErrorNumber.ERROR_UNKNOWN };
    }
    return {
      errno: SocialErrorNumber.SUCCESS,
      enemy,
    };
  }

  async deleteEnemy(
    accountId: string,
    enemyAccountId: string,
  ): Promise<[SocialErrorNumber, EnemyEntry | undefined]> {
    //XXX: Prisma가 DELETE RETURNING을 deleteMany에서 지원하지 않았음.
    //XXX: Prisma가 DeleteUniqueIfExists 따위를 지원하지 않았음.
    let data: [Enemy | null, unknown];
    try {
      data = await this.prisma.$transaction([
        this.prisma.enemy.findUnique({
          where: {
            accountId_enemyAccountId: { accountId, enemyAccountId },
          },
        }),
        this.prisma.enemy.deleteMany({
          where: { accountId, enemyAccountId },
        }),
      ]);
    } catch (e) {
      ChatService.logUnknownError(e);
      return [SocialErrorNumber.ERROR_UNKNOWN, undefined];
    }
    const [forward] = data;
    if (forward !== null) {
      return [SocialErrorNumber.ERROR_NOT_FOUND, undefined];
    }
    return [SocialErrorNumber.SUCCESS, forward !== null ? forward : undefined];
  }

  async loadPublicRoomList(): Promise<ChatRoomViewEntry[]> {
    const rooms = await this.prisma.chat.findMany({
      where: { isPrivate: false },
      include: { members: { select: { chatId: true, accountId: true } } },
    });

    return rooms.map((e) => ({
      ...e,
      memberCount: e.members.length,
    }));
  }

  async createNewRoom(
    ownerAccountId: string,
    roomOptions: Prisma.ChatCreateInput,
    members: Prisma.ChatMemberCreateManyChatInput[],
  ): Promise<ChatCreateRoomResult> {
    return this.prisma.$transaction(async (tx) => {
      const inspect = await this.prepareInspect(tx, ownerAccountId);
      if (inspect !== undefined) {
        return inspect;
      }

      let room: ChatRoomForEntry;
      try {
        room = await tx.chat.create({
          data: {
            ...roomOptions,
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

      const memberSet = new Set<string>(room.members.map((e) => e.accountId));
      this.memberCache.set(room.id, memberSet);

      return {
        errno: RoomErrorNumber.SUCCESS,
        room: toChatRoomEntry(room),
      };
    });
  }

  async enterRoom(
    chatId: string,
    accountId: string,
    password: string | null,
  ): Promise<ChatEnterRoomResult> {
    return this.prisma.$transaction(async (tx) => {
      const inspect = await this.prepareInspect(tx, accountId);
      if (inspect !== undefined) {
        return inspect;
      }

      const memberSet = await this.getChatMemberSet(chatId, tx);
      if (memberSet === null) {
        return { errno: RoomErrorNumber.ERROR_NO_ROOM };
      }
      if (memberSet.has(accountId)) {
        return { errno: RoomErrorNumber.ERROR_ALREADY_MEMBER };
      }

      const room = await tx.chat.findUniqueOrThrow({
        where: { id: chatId },
        select: { isSecret: true, password: true, limit: true },
      });
      if (room.isSecret && password !== room.password) {
        return { errno: RoomErrorNumber.ERROR_WRONG_PASSWORD };
      }
      if (memberSet.size >= room.limit) {
        return { errno: RoomErrorNumber.ERROR_EXCEED_LIMIT };
      }

      const bans = await this.getChatBanned(
        chatId,
        accountId,
        BanCategory.ACCESS,
        tx,
      );
      if (bans.length !== 0) {
        return { errno: RoomErrorNumber.ERROR_CHAT_BANNED, bans };
      }

      return this.insertChatMember(tx, chatId, accountId, RoleNumber.USER);
    });
  }

  async leaveRoom(
    chatId: string,
    accountId: string,
  ): Promise<ChatLeaveRoomResult> {
    return this.prisma.$transaction(async (tx) => {
      const inspect = await this.prepareInspect(tx, accountId);
      if (inspect !== undefined) {
        return inspect;
      }

      const memberSet = await this.getChatMemberSet(chatId, tx);
      if (memberSet === null) {
        return { errno: RoomErrorNumber.ERROR_NO_ROOM };
      }
      if (!memberSet.has(accountId)) {
        return { errno: RoomErrorNumber.ERROR_NO_MEMBER };
      }

      const member = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId } },
        select: { role: true },
      });
      if (member.role === Role.ADMINISTRATOR) {
        return { errno: RoomErrorNumber.ERROR_RESTRICTED };
      }

      return this.deleteChatMember(tx, chatId, accountId);
    });
  }

  async inviteRoomMember(
    chatId: string,
    accountId: string,
    targetAccountId: string,
  ): Promise<ChatEnterRoomResult> {
    return this.prisma.$transaction(async (tx) => {
      const inspect = await this.prepareInspect(tx, accountId);
      if (inspect !== undefined) {
        return inspect;
      }

      const memberSet = await this.getChatMemberSet(chatId, tx);
      if (memberSet === null) {
        return { errno: RoomErrorNumber.ERROR_NO_ROOM };
      }
      if (!memberSet.has(accountId)) {
        return { errno: RoomErrorNumber.ERROR_UNJOINED };
      }
      if (memberSet.has(targetAccountId)) {
        return { errno: RoomErrorNumber.ERROR_ALREADY_MEMBER };
      }

      if (accountId === targetAccountId) {
        return { errno: RoomErrorNumber.ERROR_SELF };
      }
      if (!(await this.isDuplexFriend(accountId, targetAccountId, tx))) {
        return { errno: RoomErrorNumber.ERROR_ENEMY };
      }

      const room = await tx.chat.findUniqueOrThrow({
        where: { id: chatId },
        select: { isSecret: true, password: true, limit: true },
      });
      const member = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId } },
        select: { role: true },
      });
      if (
        room.isSecret &&
        room.password !== "" &&
        !(member.role === Role.MANAGER || member.role === Role.ADMINISTRATOR)
      ) {
        return { errno: RoomErrorNumber.ERROR_PERMISSION };
      }
      if (memberSet.size >= room.limit) {
        return { errno: RoomErrorNumber.ERROR_EXCEED_LIMIT };
      }

      const bans = await this.getChatBanned(
        chatId,
        targetAccountId,
        BanCategory.ACCESS,
        tx,
      );
      if (bans.length !== 0) {
        //NOTE: Do NOT with `bans`
        return { errno: RoomErrorNumber.ERROR_CHAT_BANNED, bans: null };
      }

      return this.insertChatMember(
        tx,
        chatId,
        targetAccountId,
        RoleNumber.USER,
      );
    });
  }

  async muteRoomMember(
    chatId: string,
    accountId: string,
    targetAccountId: string,
    reason: string,
    memo: string,
    timespanSecs: number | null,
  ): Promise<ChatBanResult> {
    return this.prisma.$transaction(async (tx) => {
      const inspect = await this.prepareInspect(tx, accountId);
      if (inspect !== undefined) {
        return inspect;
      }

      const memberSet = await this.getChatMemberSet(chatId, tx);
      if (memberSet === null) {
        return { errno: RoomErrorNumber.ERROR_NO_ROOM };
      }
      if (!memberSet.has(accountId)) {
        return { errno: RoomErrorNumber.ERROR_UNJOINED };
      }
      if (!memberSet.has(targetAccountId)) {
        return { errno: RoomErrorNumber.ERROR_NO_MEMBER };
      }

      if (accountId === targetAccountId) {
        return { errno: RoomErrorNumber.ERROR_SELF };
      }

      const member = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId } },
        select: { role: true },
      });
      if (
        !(member.role === Role.MANAGER || member.role === Role.ADMINISTRATOR)
      ) {
        return { errno: RoomErrorNumber.ERROR_PERMISSION };
      }
      const targetMember = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId: targetAccountId } },
        select: { role: true },
      });
      if (targetMember.role === Role.ADMINISTRATOR) {
        return { errno: RoomErrorNumber.ERROR_RESTRICTED };
      }

      const ban = await this.prisma.chatBan.create({
        data: {
          chatId,
          accountId: targetAccountId,
          managerAccountId: accountId,
          category: BanCategory.COMMIT,
          reason,
          memo,
          expireTimestamp:
            timespanSecs !== null
              ? new Date(Date.now() + timespanSecs * 1000)
              : null,
        },
      });
      return {
        errno: RoomErrorNumber.SUCCESS,
        chatId,
        accountId: targetAccountId,
        ban: toBanSummaryEntry(ban),
      };
    });
  }

  async kickRoomMember(
    chatId: string,
    accountId: string,
    targetAccountId: string,
    reason: string,
    memo: string,
    timespanSecs: number | null,
  ): Promise<ChatBanResult> {
    return this.prisma.$transaction(async (tx) => {
      const inspect = await this.prepareInspect(tx, accountId);
      if (inspect !== undefined) {
        return inspect;
      }

      const memberSet = await this.getChatMemberSet(chatId, tx);
      if (memberSet === null) {
        return { errno: RoomErrorNumber.ERROR_NO_ROOM };
      }
      if (!memberSet.has(accountId)) {
        return { errno: RoomErrorNumber.ERROR_UNJOINED };
      }
      if (!memberSet.has(targetAccountId)) {
        return { errno: RoomErrorNumber.ERROR_NO_MEMBER };
      }

      if (accountId === targetAccountId) {
        return { errno: RoomErrorNumber.ERROR_SELF };
      }

      const member = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId } },
        select: { role: true },
      });
      if (
        !(member.role === Role.MANAGER || member.role === Role.ADMINISTRATOR)
      ) {
        return { errno: RoomErrorNumber.ERROR_PERMISSION };
      }
      const targetMember = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId: targetAccountId } },
        select: { role: true },
      });
      if (targetMember.role === Role.ADMINISTRATOR) {
        return { errno: RoomErrorNumber.ERROR_RESTRICTED };
      }

      const ban = await this.prisma.chatBan.create({
        data: {
          chatId,
          accountId: targetAccountId,
          managerAccountId: accountId,
          category: BanCategory.ACCESS,
          reason,
          memo,
          expireTimestamp:
            timespanSecs !== null
              ? new Date(Date.now() + timespanSecs * 1000)
              : null,
        },
      });

      const result = await this.deleteChatMember(tx, chatId, targetAccountId);
      if (result.errno === RoomErrorNumber.SUCCESS) {
        return {
          ...result,
          ban: toBanSummaryEntry(ban),
        };
      }
      return result;
    });
  }

  async unbanMember(accountId: string, banId: string): Promise<ChatBanResult> {
    return this.prisma.$transaction(async (tx) => {
      const inspect = await this.prepareInspect(tx, accountId);
      if (inspect !== undefined) {
        return inspect;
      }

      const ban = await tx.chatBan.findUnique({ where: { id: banId } });
      if (ban === null) {
        return { errno: RoomErrorNumber.ERROR_UNKNOWN };
      }
      const { chatId, accountId: targetAccountId, managerAccountId } = ban;

      const memberSet = await this.getChatMemberSet(chatId, tx);
      if (memberSet === null) {
        return { errno: RoomErrorNumber.ERROR_NO_ROOM };
      }
      if (!memberSet.has(accountId)) {
        return { errno: RoomErrorNumber.ERROR_UNJOINED };
      }

      if (accountId === targetAccountId) {
        return { errno: RoomErrorNumber.ERROR_SELF };
      }

      const member = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId } },
        select: { role: true },
      });
      if (
        !(member.role === Role.MANAGER || member.role === Role.ADMINISTRATOR)
      ) {
        return { errno: RoomErrorNumber.ERROR_PERMISSION };
      }
      const managerMember = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId: managerAccountId } },
        select: { role: true },
      });
      if (
        member.role !== Role.ADMINISTRATOR &&
        managerMember.role === Role.ADMINISTRATOR
      ) {
        return { errno: RoomErrorNumber.ERROR_RESTRICTED };
      }

      return {
        errno: RoomErrorNumber.SUCCESS,
        chatId,
        accountId: targetAccountId,
        ban: toBanSummaryEntry(ban),
      };
    });
  }

  async trySendMessage(
    chatId: string,
    accountId: string,
    content: string,
  ): Promise<ChatMessageResult> {
    if (content === "") {
      return { errno: RoomErrorNumber.ERROR_RESTRICTED };
    }

    return this.prisma.$transaction(async (tx) => {
      const inspect = await this.prepareInspect(tx, accountId);
      if (inspect !== undefined) {
        return inspect;
      }

      const memberSet = await this.getChatMemberSet(chatId, tx);
      if (memberSet === null) {
        return { errno: RoomErrorNumber.ERROR_NO_ROOM };
      }
      if (!memberSet.has(accountId)) {
        return { errno: RoomErrorNumber.ERROR_UNJOINED };
      }

      const bans = await this.getChatBanned(
        chatId,
        accountId,
        BanCategory.COMMIT,
        tx,
      );
      if (bans.length !== 0) {
        return { errno: RoomErrorNumber.ERROR_CHAT_BANNED, bans };
      }

      const message = await this.createNewChatMessage(
        chatId,
        accountId,
        content,
        MessageTypeNumber.REGULAR,
      );
      if (message === null) {
        return { errno: RoomErrorNumber.ERROR_UNKNOWN };
      }
      return {
        errno: RoomErrorNumber.SUCCESS,
        message,
      };
    });
  }

  async getChatMemberSet(
    chatId: string,
    tx?: PrismaTransactionClient | undefined,
  ): Promise<Set<string> | null> {
    const cache = this.memberCache.get(chatId);
    if (cache !== undefined) {
      //NOTE: Implement invalidate cache
      return cache;
    }

    tx ??= this.prisma;
    const room = await tx.chat.findUnique({
      where: { id: chatId },
      select: { members: { select: { accountId: true } } },
    });

    const memberSet =
      room !== null
        ? new Set<string>(room.members.map((e) => e.accountId))
        : null;
    this.memberCache.set(chatId, memberSet);
    return memberSet;
  }

  async changeMemberRole(
    chatId: string,
    accountId: string,
    targetAccountId: string,
    role: RoleNumber,
  ): Promise<ChatMemberResult> {
    return this.prisma.$transaction(async (tx) => {
      const inspect = await this.prepareInspect(tx, accountId);
      if (inspect !== undefined) {
        return inspect;
      }

      const memberSet = await this.getChatMemberSet(chatId, tx);
      if (memberSet === null) {
        return { errno: RoomErrorNumber.ERROR_NO_ROOM };
      }
      if (!memberSet.has(accountId)) {
        return { errno: RoomErrorNumber.ERROR_UNJOINED };
      }
      if (!memberSet.has(targetAccountId)) {
        return { errno: RoomErrorNumber.ERROR_NO_MEMBER };
      }

      if (accountId === targetAccountId) {
        return { errno: RoomErrorNumber.ERROR_SELF };
      }

      const member = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId } },
        select: { role: true },
      });
      if (member.role !== Role.ADMINISTRATOR) {
        return { errno: RoomErrorNumber.ERROR_PERMISSION };
      }
      const targetMember = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId: targetAccountId } },
        select: { role: true },
      });
      if (role === getRoleNumber(targetMember.role)) {
        return { errno: RoomErrorNumber.ERROR_RESTRICTED };
      }
      const updatedTargetMember = await tx.chatMember.update({
        where: { chatId_accountId: { chatId, accountId: targetAccountId } },
        data: { role: getRoleFromNumber(role) },
        select: { chatId: true, accountId: true },
      });

      return {
        errno: RoomErrorNumber.SUCCESS,
        ...updatedTargetMember,
      };
    });
  }

  async changeAdministrator(
    chatId: string,
    accountId: string,
    targetAccountId: string,
  ): Promise<ChatMemberResult> {
    return this.prisma.$transaction(async (tx) => {
      const inspect = await this.prepareInspect(tx, accountId);
      if (inspect !== undefined) {
        return inspect;
      }

      const memberSet = await this.getChatMemberSet(chatId, tx);
      if (memberSet === null) {
        return { errno: RoomErrorNumber.ERROR_NO_ROOM };
      }
      if (!memberSet.has(accountId)) {
        return { errno: RoomErrorNumber.ERROR_UNJOINED };
      }
      if (!memberSet.has(targetAccountId)) {
        return { errno: RoomErrorNumber.ERROR_NO_MEMBER };
      }

      if (accountId === targetAccountId) {
        return { errno: RoomErrorNumber.ERROR_SELF };
      }

      const member = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId } },
        select: { role: true },
      });
      if (member.role !== Role.ADMINISTRATOR) {
        return { errno: RoomErrorNumber.ERROR_PERMISSION };
      }
      const targetMember = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId: targetAccountId } },
        select: { role: true },
      });
      if (
        !(
          targetMember.role === Role.MANAGER ||
          targetMember.role === Role.ADMINISTRATOR
        )
      ) {
        return { errno: RoomErrorNumber.ERROR_RESTRICTED };
      }
      const updatedMember = await tx.chatMember.update({
        where: { chatId_accountId: { chatId, accountId } },
        data: { role: targetMember.role },
      });
      void updatedMember;
      const updatedTargetMember = await tx.chatMember.update({
        where: { chatId_accountId: { chatId, accountId: targetAccountId } },
        data: { role: member.role },
        select: { chatId: true, accountId: true },
      });

      return {
        errno: RoomErrorNumber.SUCCESS,
        ...updatedTargetMember,
      };
    });
  }

  async removeRoom(
    chatId: string,
    accountId: string,
  ): Promise<ChatMemberResult> {
    return this.prisma.$transaction(async (tx) => {
      const inspect = await this.prepareInspect(tx, accountId);
      if (inspect !== undefined) {
        return inspect;
      }

      const memberSet = await this.getChatMemberSet(chatId, tx);
      if (memberSet === null) {
        return { errno: RoomErrorNumber.ERROR_NO_ROOM };
      }
      if (!memberSet.has(accountId)) {
        return { errno: RoomErrorNumber.ERROR_UNJOINED };
      }
      if (memberSet.size === 1) {
        return { errno: RoomErrorNumber.ERROR_RESTRICTED };
      }

      const member = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_accountId: { chatId, accountId } },
        select: { chatId: true, accountId: true, role: true },
      });
      if (member.role !== Role.ADMINISTRATOR) {
        return { errno: RoomErrorNumber.ERROR_PERMISSION };
      }

      let room: Chat;
      try {
        room = await tx.chat.delete({ where: { id: member.chatId } });
        //NOTE: chat_members & chat_messages are expected to be deleted by `ON DELETE CASCADE`
      } catch (e) {
        ChatService.logUnknownError(e);
        return { errno: RoomErrorNumber.ERROR_UNKNOWN };
      }

      this.memberCache.set(room.id, null);

      return {
        errno: RoomErrorNumber.SUCCESS,
        chatId: room.id,
        accountId: member.accountId,
      };
    });
  }

  async prepareInspect(
    tx: PrismaTransactionClient,
    accountId: string,
  ): Promise<ChatRoomFailed | undefined> {
    const bans = await this.accounts.findActiveBansOnTransaction(tx, accountId);
    if (bans.length !== 0) {
      //TODO: return with `bans`
      return { errno: RoomErrorNumber.ERROR_ACCOUNT_BAN };
    }

    return undefined;
  }

  async insertChatMember(
    tx: PrismaTransactionClient,
    chatId: string,
    accountId: string,
    role: RoleNumber,
  ): Promise<ChatEnterRoomResult> {
    let member: ChatMemberWithRoom;
    try {
      member = await tx.chatMember.create({
        ...chatMemberWithRoom,
        data: {
          accountId,
          chatId,
          role: getRoleFromNumber(role),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          // An operation failed because it depends on one or more records that were required but not found. {cause}
          return { errno: RoomErrorNumber.ERROR_ALREADY_MEMBER };
        }
      }
      ChatService.logUnknownError(e);
      return { errno: RoomErrorNumber.ERROR_UNKNOWN };
    }

    const cache = this.memberCache.get(chatId);
    if (cache !== undefined && cache !== null) {
      cache.add(accountId);
    }

    return {
      errno: RoomErrorNumber.SUCCESS,
      room: toChatRoomEntry(member.chat),
      member: toChatMemberEntry(member),
    };
  }

  async deleteChatMember(
    tx: PrismaTransactionClient,
    chatId: string,
    accountId: string,
  ): Promise<ChatLeaveRoomResult> {
    const cache = this.memberCache.get(chatId);
    if (cache !== undefined && cache !== null) {
      cache.delete(accountId);
    }

    let member: ChatMember;
    try {
      member = await tx.chatMember.delete({
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

    return {
      errno: RoomErrorNumber.SUCCESS,
      chatId: member.chatId,
      accountId: member.accountId,
    };
  }

  async createNewChatMessage(
    chatId: string,
    accountId: string,
    content: string,
    messageType: MessageTypeNumber,
    tx?: PrismaTransactionClient | undefined,
  ): Promise<ChatMessageEntry | null> {
    tx ??= this.prisma;
    try {
      const message = await tx.chatMessage.create({
        data: {
          chatId,
          accountId,
          content,
          messageType: getMessageTypeFromNumber(messageType),
        },
      });
      return {
        ...message,
        messageType: getMessageTypeNumber(message.messageType),
      };
    } catch (e) {
      ChatService.logUnknownError(e);
      return null;
    }
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
    tx?: PrismaTransactionClient | undefined,
  ): Promise<ChatBanSummaryEntry[]> {
    tx ??= this.prisma;
    const bans = await tx.chatBan.findMany({
      where: {
        chatId,
        accountId,
        category,
        OR: [
          { expireTimestamp: null },
          { expireTimestamp: { gte: new Date() } },
        ],
      },
    });

    return bans.map((e) => toBanSummaryEntry(e));
  }

  async getChatBannedForManager(chatId: string): Promise<ChatBanDetailEntry[]> {
    const bans = await this.prisma.chatBan.findMany({ where: { chatId } });

    return bans.map((e) => toBanDetailEntry(e));
  }
}

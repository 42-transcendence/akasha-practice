import { PrismaService } from "@/prisma/prisma.service";
import { Injectable } from "@nestjs/common";
import {
  ChatMessageEntry,
  ChatRoomEntry,
  ChatRoomMemberEntry,
  ChatRoomViewEntry,
  FRIEND_ACTIVE_FLAGS_SIZE,
  FriendEntry,
  RoomErrorNumber,
  SocialPayload,
} from "@common/chat-payloads";
import { AccountsService } from "@/user/accounts/accounts.service";
import {
  ActiveStatus,
  BanCategory,
  ChatBan,
  ChatMember,
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

/// ChatMemberForEntry
const chatMemberForEntry = Prisma.validator<Prisma.ChatMemberDefaultArgs>()({
  select: {
    accountId: true,
    role: true,
  },
});
export type ChatMemberForEntry = Prisma.ChatMemberGetPayload<
  typeof chatMemberForEntry
>;

export function toChatMemberEntry(
  member: ChatMemberForEntry,
): ChatRoomMemberEntry {
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
export type ChatRoomForEntry = Prisma.ChatGetPayload<typeof chatRoomForEntry>;

export function toChatRoomEntry(
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
export type ChatMemberWithRoom = Prisma.ChatMemberGetPayload<
  typeof chatMemberWithRoom
>;

@Injectable()
export class ChatService {
  private readonly memberCache = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

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

  async loadOwnRoomList(accountId: string): Promise<ChatRoomEntry[]> {
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
        friends: {
          select: {
            friendAccountId: true,
            groupName: true,
            activeFlags: true,
          },
        },
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

    const friendList = data.friends.map((e) => ({
      ...e,
      activeFlags: fromBitsString(e.activeFlags, FRIEND_ACTIVE_FLAGS_SIZE),
    }));

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
    targetAccountId: string,
    groupName: string,
    activeFlags: number,
  ): Promise<FriendEntry> {
    const data = await this.prisma.friend.create({
      data: {
        account: { connect: { id: accountId } },
        friendAccount: { connect: { id: targetAccountId } },
        groupName,
        activeFlags: toBitsString(activeFlags, FRIEND_ACTIVE_FLAGS_SIZE),
      },
    });
    return {
      ...data,
      activeFlags: fromBitsString(data.activeFlags, FRIEND_ACTIVE_FLAGS_SIZE),
    };
  }

  async modifyFriend(
    accountId: string,
    targetAccountId: string,
    groupName: string | undefined,
    activeFlags: number | undefined,
  ): Promise<FriendEntry> {
    const data = await this.prisma.friend.update({
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
    return {
      ...data,
      activeFlags: fromBitsString(data.activeFlags, FRIEND_ACTIVE_FLAGS_SIZE),
    };
  }

  async deleteFriend(
    accountId: string,
    targetAccountId: string,
  ): Promise<number> {
    const batch = await this.prisma.friend.deleteMany({
      where: {
        OR: [
          {
            account: { id: accountId },
            friendAccount: { id: targetAccountId },
          },
          {
            friendAccount: { id: accountId },
            account: { id: targetAccountId },
          },
        ],
      },
    });
    return batch.count;
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

    const forward = data.friends.reduce(
      (set, e) => set.add(e.friendAccountId),
      new Set<string>(),
    );

    return data.friendReferences
      .filter((e) => forward.has(e.accountId))
      .map((e) => ({
        ...e,
        activeFlags: fromBitsString(e.activeFlags, FRIEND_ACTIVE_FLAGS_SIZE),
      }));
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

  async createNewRoom(
    req: Prisma.ChatCreateInput & {
      members: Prisma.ChatMemberCreateManyChatInput[];
    },
  ): Promise<
    | { errno: RoomErrorNumber.SUCCESS; room: ChatRoomForEntry }
    | { errno: Exclude<RoomErrorNumber, RoomErrorNumber.SUCCESS> }
  > {
    //FIXME: Transaction? 방 만들기 실패의 경우의 수 찾기
    const data = await this.prisma.chat.create({
      data: {
        ...req,
        members: {
          createMany: { data: req.members },
        },
      },
      include: {
        ...chatRoomForEntry.include,
        messages: true,
      },
    });

    const memberSet = new Set<string>(data.members.map((e) => e.accountId));
    this.memberCache.set(data.id, memberSet);

    return { errno: RoomErrorNumber.SUCCESS, room: data };
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
    role: RoleNumber,
  ): Promise<ChatMemberWithRoom | null> {
    try {
      const data = await this.prisma.chatMember.create({
        ...chatMemberWithRoom,
        data: {
          account: { connect: { id: accountId } },
          chat: { connect: { id: chatId } },
          role: getRoleFromNumber(role),
        },
      });

      const cache = this.memberCache.get(chatId);
      if (cache !== undefined) {
        cache.add(accountId);
      }

      return data;
    } catch (e) {
      //FIXME: 개선
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          // An operation failed because it depends on one or more records that were required but not found. {cause}
          return null;
        }
      }
      throw e;
    }
  }

  async deleteChatMember(
    chatId: string,
    accountId: string,
  ): Promise<ChatMember> {
    const cache = this.memberCache.get(chatId);
    if (cache !== undefined) {
      cache.delete(accountId);
    }

    const data = await this.prisma.chatMember.delete({
      where: { chatId_accountId: { chatId, accountId } },
    });

    return data;
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
    chatId: string,
    accountId: string,
    lastMessageId: string,
  ): Promise<void> {
    void (await this.prisma.chatMember.update({
      where: { chatId_accountId: { chatId, accountId } },
      data: { lastMessageId },
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

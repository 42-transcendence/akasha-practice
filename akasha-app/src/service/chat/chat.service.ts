import { PrismaService } from "@/prisma/prisma.service";
import { Injectable } from "@nestjs/common";
import {
  ChatMessageEntry,
  ChatRoomEntry,
  ChatRoomMemberEntry,
  ChatRoomViewEntry,
  FriendEntry,
  NewChatRoomRequest,
  SocialPayload,
} from "@common/chat-payloads";
import { AccountsService } from "@/user/accounts/accounts.service";
import { ActiveStatus, BanType, ChatBan, Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import {
  ActiveStatusNumber,
  getActiveStatusFromNumber,
  getActiveStatusNumber,
} from "@common/generated/types";

/// ChatRoom
const chatRoomWithMembers = Prisma.validator<Prisma.ChatDefaultArgs>()({
  include: {
    members: {
      include: {
        account: { select: { uuid: true } },
      },
    },
  },
});
export type ChatRoomWithMembers = Prisma.ChatGetPayload<
  typeof chatRoomWithMembers
>;

export function toChatRoomEntry(chat: ChatRoomWithMembers): ChatRoomEntry {
  return {
    ...chat,
    members: chat.members.map((e) => ({
      ...e,
      uuid: e.account.uuid,
    })),
    lastMessageId: null,
  };
}

/// ChatMemberWithRoom
const chatMemberWithRoom = Prisma.validator<Prisma.ChatMemberDefaultArgs>()({
  include: {
    chat: { ...chatRoomWithMembers },
    account: { select: { uuid: true } },
  },
});
export type ChatMemberWithRoom = Prisma.ChatMemberGetPayload<
  typeof chatMemberWithRoom
>;

export function toChatMemberEntry(
  member: ChatMemberWithRoom,
): ChatRoomMemberEntry {
  return {
    ...member,
    uuid: member.account.uuid,
  };
}

@Injectable()
export class ChatService {
  private readonly memberCache = new Map<string, Set<number>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  // forward
  async getAccountId(accountUUID: string) {
    return this.accounts.findAccountIdByUUID(accountUUID);
  }

  // forward
  async getActiveStatus(accountUUID: string) {
    const activeStatusRaw = await this.accounts.findActiveStatusByUUID(
      accountUUID,
    );
    return activeStatusRaw !== null
      ? getActiveStatusNumber(activeStatusRaw)
      : null;
  }

  // forward
  async setActiveStatus(accountUUID: string, activeStatus: ActiveStatusNumber) {
    return this.accounts.updateActiveStatusByUUID(
      accountUUID,
      getActiveStatusFromNumber(activeStatus),
    );
  }

  // forward
  async setActiveTimestamp(accountUUID: string, force: boolean) {
    return this.accounts.updateActiveTimestampByUUID(
      accountUUID,
      force ? undefined : ActiveStatus.INVISIBLE,
    );
  }

  async loadOwnRoomListByAccountId(
    accountId: number,
  ): Promise<ChatRoomEntry[]> {
    const data = await this.prisma.chatMember.findMany({
      where: { accountId },
      select: {
        chat: {
          include: {
            members: {
              select: {
                account: { select: { uuid: true } },
                modeFlags: true,
              },
            },
          },
        },
        lastMessageId: true,
      },
    });

    return data.map((e) => ({
      ...e.chat,
      members: e.chat.members.map((e) => ({
        ...e,
        uuid: e.account.uuid,
      })),
      lastMessageId: e.lastMessageId,
    }));
  }

  async loadMessagesAfter(
    roomUUID: string,
    lastMessageId: string | undefined,
  ): Promise<ChatMessageEntry[]> {
    const data = await this.prisma.chatMessage.findMany({
      where: {
        chat: { uuid: roomUUID },
      },
      include: {
        //XXX: UUID를 가져올 때 Index-Only Scan을 사용하는 것이 성능에 유리하지만, Prisma가 Covering Index를 지원하지 않았음.
        chat: { select: { uuid: true } },
        account: { select: { uuid: true } },
      },
      orderBy: {
        timestamp: Prisma.SortOrder.asc,
      },
      ...(lastMessageId !== undefined
        ? {
            skip: 1,
            cursor: {
              uuid: lastMessageId,
            },
          }
        : {}),
      take: 1024, //FIXME: 무제한이어도 잘 되어야 함.
    });

    return data.map((e) => ({
      ...e,
      roomUUID: e.chat.uuid,
      memberUUID: e.account.uuid,
    }));
  }

  async loadSocialByAccountId(id: number): Promise<SocialPayload> {
    const data = await this.prisma.account.findUniqueOrThrow({
      where: { id },
      select: {
        friends: {
          select: {
            friendAccount: { select: { uuid: true } },
            groupName: true,
            activeFlags: true,
          },
        },
        friendReferences: {
          select: {
            account: { select: { uuid: true } },
          },
        },
        enemies: {
          select: {
            enemyAccount: { select: { uuid: true } },
            memo: true,
          },
        },
      },
    });

    const friendList = data.friends.map((e) => ({
      uuid: e.friendAccount.uuid,
      groupName: e.groupName,
      activeFlags: e.activeFlags,
    }));

    const friendUUIDSet = new Set<string>(
      data.friends.map((e) => e.friendAccount.uuid),
    );
    const friendRequestList = data.friendReferences
      .map((e) => e.account.uuid)
      .filter((e) => !friendUUIDSet.has(e));

    const enemyList = data.enemies.map((e) => ({
      uuid: e.enemyAccount.uuid,
      memo: e.memo,
    }));

    return { friendList, friendRequestList, enemyList };
  }

  async addFriend(
    accountId: number,
    targetUUID: string,
    groupName: string,
    activeFlags: number,
  ): Promise<FriendEntry | null> {
    try {
      const data = await this.prisma.friend.create({
        data: {
          account: { connect: { id: accountId } },
          friendAccount: { connect: { uuid: targetUUID } },
          groupName,
          activeFlags,
        },
        include: {
          account: { select: { uuid: true } },
          friendAccount: { select: { uuid: true } },
        },
      });
      return { ...data, uuid: data.friendAccount.uuid };
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code === "P2002") {
          return null;
        }
      }
      throw e;
    }
  }

  async modifyFriend(
    accountId: number,
    targetUUID: string,
    mutationInput: Prisma.FriendUpdateManyMutationInput,
  ): Promise<FriendEntry | null> {
    const targetId = await this.getAccountId(targetUUID);
    if (targetId === null) {
      return null;
    }
    const data = await this.prisma.friend.update({
      data: mutationInput,
      where: {
        accountId_friendAccountId: { accountId, friendAccountId: targetId },
      },
      include: {
        account: { select: { uuid: true } },
        friendAccount: { select: { uuid: true } },
      },
    });
    return { ...data, uuid: data.friendAccount.uuid };
  }

  async deleteFriend(accountId: number, targetUUID: string): Promise<boolean> {
    const batch = await this.prisma.friend.deleteMany({
      where: {
        OR: [
          { account: { id: accountId }, friendAccount: { uuid: targetUUID } },
          { friendAccount: { id: accountId }, account: { uuid: targetUUID } },
        ],
      },
    });
    return batch.count !== 0;
  }

  async isDuplexFriendByUUID(
    accountId: number,
    targetUUID: string,
  ): Promise<boolean> {
    const data = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        friends: {
          select: { friendAccountId: true },
          where: { friendAccount: { uuid: targetUUID } },
        },
        friendReferences: {
          select: { accountId: true },
          where: { account: { uuid: targetUUID } },
        },
      },
    });
    return (
      data !== null &&
      data.friends.length !== 0 &&
      data.friendReferences.length !== 0
    );
  }

  async getDuplexFriendsByUUID(uuid: string): Promise<FriendEntry[] | null> {
    const data = await this.prisma.account.findUnique({
      where: { uuid },
      select: {
        friends: { select: { friendAccount: { select: { uuid: true } } } },
        friendReferences: { include: { account: { select: { uuid: true } } } },
      },
    });
    if (data === null) {
      return null;
    }

    const forward = data.friends.reduce(
      (set, e) => set.add(e.friendAccount.uuid),
      new Set<string>(),
    );

    return data.friendReferences
      .filter((e) => forward.has(e.account.uuid))
      .map((e) => ({ ...e, uuid: e.account.uuid }));
  }

  async getDuplexFriendUUIDSetByUUID(
    uuid: string,
  ): Promise<Set<string> | null> {
    const friends = await this.getDuplexFriendsByUUID(uuid);
    if (friends === null) {
      return null;
    }

    return friends.reduce((set, e) => set.add(e.uuid), new Set<string>());
  }

  async loadPublicRoomList(): Promise<ChatRoomViewEntry[]> {
    const data = await this.prisma.x.chat.findMany({
      include: { members: { select: { chatId: true, accountId: true } } },
    });

    return (
      data
        //XXX: 작성시 Prisma가 generated column 혹은 computed field로의 filter를 지원하지 않았음.
        .filter((e) => !e.isPrivate)
        .map((e) => ({
          ...e,
          memberCount: e.members.length,
        }))
    );
  }

  async createNewRoom(req: NewChatRoomRequest): Promise<ChatRoomWithMembers> {
    const localMemberUUIDToId =
      await this.accounts.makeAccountIdToUUIDDictionary(
        req.members.map((e) => e.uuid),
      );

    const data = await this.prisma.chat.create({
      data: {
        ...req,
        members: {
          createMany: {
            data: req.members.reduce((array, e) => {
              const accountId = localMemberUUIDToId.get(e.uuid);
              if (accountId !== undefined) {
                array.push({
                  accountId,
                  modeFlags: e.modeFlags,
                });
              }
              return array;
            }, new Array<Prisma.ChatMemberCreateManyChatInput>()),
          },
        },
      },
      include: {
        ...chatRoomWithMembers.include,
        messages: true,
      },
    });

    const memberSet = new Set<number>(data.members.map((e) => e.accountId));
    this.memberCache.set(data.uuid, memberSet);

    return data;
  }

  async getChatMemberSet(roomUUID: string): Promise<Set<number>> {
    const cache = this.memberCache.get(roomUUID);
    if (cache !== undefined) {
      //NOTE: Implement invalidate cache
      return cache;
    }

    const data = await this.prisma.chat.findUniqueOrThrow({
      where: {
        uuid: roomUUID,
      },
      select: {
        members: {
          select: {
            accountId: true,
          },
        },
      },
    });

    const memberSet = new Set<number>(data.members.map((e) => e.accountId));
    this.memberCache.set(roomUUID, memberSet);
    return memberSet;
  }

  async insertChatMember(
    roomUUID: string,
    accountId: number,
    modeFlags: number = 0,
  ): Promise<ChatMemberWithRoom | null> {
    try {
      const data = await this.prisma.chatMember.create({
        ...chatMemberWithRoom,
        data: {
          account: {
            connect: {
              id: accountId,
            },
          },
          chat: {
            connect: {
              uuid: roomUUID,
            },
          },
          modeFlags,
        },
      });

      const cache = this.memberCache.get(roomUUID);
      if (cache !== undefined) {
        cache.add(accountId);
      }

      return data;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          // An operation failed because it depends on one or more records that were required but not found. {cause}
          return null;
        }
      }
      throw e;
    }
  }

  async insertChatMemberByUUID(
    roomUUID: string,
    accountUUID: string,
    modeFlags: number = 0,
  ): Promise<ChatMemberWithRoom | null> {
    try {
      const accountId = await this.getAccountId(accountUUID);
      if (accountId === null) {
        //FIXME: 임시
        return null;
      }

      return await this.insertChatMember(roomUUID, accountId, modeFlags);
    } catch {
      //FIXME: 임시
      return null;
    }
  }

  async deleteChatMember(
    roomUUID: string,
    accountId: number,
  ): Promise<boolean> {
    const cache = this.memberCache.get(roomUUID);
    if (cache !== undefined) {
      cache.delete(accountId);
    }

    const batch = await this.prisma.chatMember.deleteMany({
      where: {
        chat: {
          uuid: roomUUID,
        },
        accountId,
      },
    });

    return batch.count !== 0;
  }

  async createNewChatMessage(
    roomUUID: string,
    accountId: number,
    content: string,
    modeFlags: number = 0,
  ): Promise<ChatMessageEntry> {
    const data = await this.prisma.chatMessage.create({
      data: {
        chat: {
          connect: {
            uuid: roomUUID,
          },
        },
        account: {
          connect: {
            id: accountId,
          },
        },
        content,
        modeFlags,
      },
      include: {
        chat: { select: { uuid: true } },
        account: { select: { uuid: true } },
      },
    });

    return { ...data, roomUUID: data.chat.uuid, memberUUID: data.account.uuid };
  }

  async updateLastMessageCursor(
    accountId: number,
    lastMessageId: string,
  ): Promise<boolean> {
    const batch = await this.prisma.chatMember.updateMany({
      data: {
        lastMessageId,
      },
      where: {
        account: {
          id: accountId,
        },
        chat: {
          messages: {
            some: {
              uuid: lastMessageId,
            },
          },
        },
      },
    });

    return batch.count !== 0;
  }

  async getChatBanned(
    roomUUID: string,
    accountId: number,
    type: BanType,
  ): Promise<ChatBan[]> {
    const data = await this.prisma.chat.findUnique({
      where: { uuid: roomUUID },
      select: { bans: { where: { accountId, type } } },
    });

    return data?.bans ?? [];
  }

  async createChatBan(
    roomUUID: string,
    targetUUID: string,
    managerAccountId: number,
    type: BanType,
    reason: string,
    memo: string,
    expireTimestamp: Date | null,
  ): Promise<ChatBan> {
    const data = await this.prisma.chatBan.create({
      data: {
        chat: { connect: { uuid: roomUUID } },
        account: { connect: { uuid: targetUUID } },
        managerAccount: { connect: { id: managerAccountId } },
        type,
        reason,
        memo,
        expireTimestamp,
      },
    });

    return data;
  }

  async deleteChatBan(chatBanId: number): Promise<ChatBan> {
    const data = await this.prisma.chatBan.delete({
      where: { id: chatBanId },
    });

    return data;
  }

  async isChatBanned(roomUUID: string, accountId: number, type: BanType) {
    const data = await this.getChatBanned(roomUUID, accountId, type);

    //FIXME: 임시
    return data.length !== 0;
  }

  async isChatBannedByUUID(
    roomUUID: string,
    accountUUID: string,
    type: BanType,
  ) {
    try {
      const accountId = await this.getAccountId(accountUUID);
      if (accountId === null) {
        //FIXME: 임시
        return null;
      }

      return await this.isChatBanned(roomUUID, accountId, type);
    } catch {
      //FIXME: 임시
      return null;
    }
  }
}

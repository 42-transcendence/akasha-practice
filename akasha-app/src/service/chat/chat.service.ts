import { PrismaService } from "@/prisma/prisma.service";
import { Injectable } from "@nestjs/common";
import {
  ChatMessageEntry,
  ChatRoomEntry,
  ChatRoomViewEntry,
  NewChatRoomRequest,
} from "./chat-payloads";
import { ChatWebSocket } from "./chat-websocket";
import { ByteBuffer, assert } from "akasha-lib";
import { AccountsService } from "@/user/accounts/accounts.service";
import { Prisma } from "@prisma/client";

@Injectable()
export class ChatService {
  private readonly temporaryClients = new Set<ChatWebSocket>();
  private readonly clients = new Map<number, Set<ChatWebSocket>>();
  private readonly memberUUIDToId = new Map<string, number>();
  private readonly memberCache = new Map<string, Set<number>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  trackClientTemporary(client: ChatWebSocket) {
    this.temporaryClients.add(client);
  }

  trackClient(client: ChatWebSocket): void {
    assert(client.record !== undefined);

    const { id, uuid } = client.record;
    if (this.temporaryClients.delete(client)) {
      const clientSet = this.clients.get(id);
      if (clientSet !== undefined) {
        clientSet.add(client);
      } else {
        this.memberUUIDToId.set(uuid, id);
        this.clients.set(id, new Set<ChatWebSocket>([client]));
      }
    }
  }

  untrackClient(client: ChatWebSocket): void {
    if (client.record !== undefined) {
      const { id, uuid } = client.record;
      const clientSet = this.clients.get(id);

      assert(clientSet !== undefined);
      assert(clientSet.delete(client));

      if (clientSet.size == 0) {
        this.memberUUIDToId.delete(uuid);
        this.clients.delete(id);
      }
    } else {
      assert(this.temporaryClients.delete(client));
    }
  }

  unicast(
    id: number,
    buf: ByteBuffer,
    except?: ChatWebSocket | undefined,
  ): boolean {
    const clientSet = this.clients.get(id);
    if (clientSet === undefined) {
      return false;
    }

    for (const client of clientSet) {
      if (client !== except) {
        client.sendPayload(buf);
      }
    }
    return true;
  }

  unicastByAccountUUID(
    uuid: string,
    buf: ByteBuffer,
    except?: ChatWebSocket | undefined,
  ): boolean {
    const accountId = this.memberUUIDToId.get(uuid);
    if (accountId === undefined) {
      return false;
    }

    return this.unicast(accountId, buf, except);
  }

  async multicastToRoom(
    roomUUID: string,
    buf: ByteBuffer,
    except?: ChatWebSocket | undefined,
  ): Promise<number> {
    let counter: number = 0;
    const memberSet = await this.getChatMemberSet(roomUUID);
    for (const memberAccountId of memberSet) {
      if (this.unicast(memberAccountId, buf, except)) {
        counter++;
      }
    }
    return counter;
  }

  broadcast(buf: ByteBuffer, except?: ChatWebSocket | undefined): void {
    for (const [, clientSet] of this.clients) {
      for (const client of clientSet) {
        if (client !== except) {
          client.sendPayload(buf);
        }
      }
    }
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

  async loadPublicRoomList(): Promise<ChatRoomViewEntry[]> {
    const data = await this.prisma.x.chat.findMany({
      include: { members: { select: {} } },
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

  async createNewRoom(req: NewChatRoomRequest): Promise<ChatRoomEntry> {
    const localMemberUUIDToId = await this.accounts.loadAccountIdByUUIDMany(
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
                  accountId: accountId,
                  modeFlags: e.modeFlags,
                });
              }
              return array;
            }, new Array<Prisma.ChatMemberCreateManyChatInput>()),
          },
        },
      },
      include: {
        members: { include: { account: { select: { uuid: true } } } },
        messages: true,
      },
    });

    const memberSet = new Set<number>(data.members.map((e) => e.accountId));
    this.memberCache.set(data.uuid, memberSet);

    return {
      ...data,
      members: data.members.map((e) => ({
        ...e,
        uuid: e.account.uuid,
      })),
      lastMessageId: null,
    };
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
    modeFlags: number,
  ): Promise<boolean> {
    try {
      const data = await this.prisma.chatMember.create({
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
      void data;

      const cache = this.memberCache.get(roomUUID);
      if (cache !== undefined) {
        cache.add(accountId);
      }

      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          // An operation failed because it depends on one or more records that were required but not found. {cause}
          return false;
        }
      }
      throw e;
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

    const data = await this.prisma.chatMember.deleteMany({
      where: {
        chat: {
          uuid: roomUUID,
        },
        accountId,
      },
    });

    if (data.count === 0) {
      return false;
    }

    return true;
  }

  async createNewChatMessage(
    roomUUID: string,
    accountId: number,
    content: string,
    modeFlags: number,
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
}

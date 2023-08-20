import { PrismaService } from "@/prisma/prisma.service";
import { Injectable } from "@nestjs/common";
import { ChatRoomEntry } from "./chat-payloads";
import { ChatWebSocket } from "./chat-websocket";
import { ByteBuffer, assert } from "akasha-lib";

@Injectable()
export class ChatService {
  private readonly temporaryClients = new Set<ChatWebSocket>();
  private readonly clients = new Map<number, Set<ChatWebSocket>>();
  private readonly uuidToId = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

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
        this.uuidToId.set(uuid, id);
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
        this.uuidToId.delete(uuid);
        this.clients.delete(id);
      }
    } else {
      assert(this.temporaryClients.delete(client));
    }
  }

  unicast(
    uuid: string,
    buf: ByteBuffer,
    except?: ChatWebSocket | undefined,
  ): boolean {
    const accountId = this.uuidToId.get(uuid);
    if (accountId === undefined) {
      return false;
    }

    return this.unicastByAccountId(accountId, buf, except);
  }

  unicastByAccountId(
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
    const data = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        chatRooms: {
          select: {
            chat: {
              select: {
                uuid: true,
                members: {
                  select: {
                    account: { select: { uuid: true } },
                    modeFlags: true,
                  },
                },
              },
            },
            modeFlags: true,
            lastMessageId: true,
          },
        },
      },
    });

    return data.chatRooms.map((e) => ({
      uuid: e.chat.uuid,
      modeFlags: e.modeFlags,
      members: e.chat.members.map((e) => ({
        uuid: e.account.uuid,
        modeFlags: e.modeFlags,
      })),
      lastMessageId: e.lastMessageId,
    }));
  }
}

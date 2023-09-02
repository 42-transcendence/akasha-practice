import { Injectable } from "@nestjs/common";
import { ChatWebSocket } from "./chat-websocket";
import { ByteBuffer, assert } from "akasha-lib";
import { ChatService } from "./chat.service";
import { ActiveStatusNumber } from "@common/generated/types";

@Injectable()
export class ChatServer {
  private readonly temporaryClients = new Set<ChatWebSocket>();
  private readonly clients = new Map<number, Set<ChatWebSocket>>();
  private readonly memberUUIDToId = new Map<string, number>();

  constructor(private readonly service: ChatService) {}

  async trackClientTemporary(client: ChatWebSocket): Promise<void> {
    this.temporaryClients.add(client);
  }

  async trackClient(client: ChatWebSocket): Promise<void> {
    assert(client.account !== undefined);

    const { id, uuid } = client.account;
    if (this.temporaryClients.delete(client)) {
      const clientSet = this.clients.get(id);
      if (clientSet !== undefined) {
        clientSet.add(client);
      } else {
        this.memberUUIDToId.set(uuid, id);
        this.clients.set(id, new Set<ChatWebSocket>([client]));
        await client.onFirstConnection();
      }
    }
  }

  async untrackClient(client: ChatWebSocket): Promise<void> {
    if (client.account !== undefined) {
      const { id, uuid } = client.account;
      const clientSet = this.clients.get(id);

      assert(clientSet !== undefined);
      assert(clientSet.delete(client));

      if (clientSet.size === 0) {
        await client.onLastDisconnect();
        this.memberUUIDToId.delete(uuid);
        this.clients.delete(id);
      }
    } else {
      assert(this.temporaryClients.delete(client));
    }
  }

  sharedAction(
    id: number,
    action: (client: ChatWebSocket) => void,
    except?: ChatWebSocket | undefined,
  ): boolean {
    const clientSet = this.clients.get(id);
    if (clientSet === undefined) {
      return false;
    }

    for (const client of clientSet) {
      if (client !== except) {
        action(client);
      }
    }
    return true;
  }

  unicast(
    id: number,
    buf: ByteBuffer,
    except?: ChatWebSocket | undefined,
  ): boolean {
    return this.sharedAction(id, (client) => client.sendPayload(buf), except);
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

  broadcast(buf: ByteBuffer, except?: ChatWebSocket | undefined): void {
    for (const [, clientSet] of this.clients) {
      for (const client of clientSet) {
        if (client !== except) {
          client.sendPayload(buf);
        }
      }
    }
  }

  async multicastToRoom(
    roomUUID: string,
    buf: ByteBuffer,
    exceptAccountId?: number | undefined,
  ): Promise<number> {
    let counter = 0;
    const memberSet = await this.service.getChatMemberSet(roomUUID);
    for (const memberAccountId of memberSet) {
      if (memberAccountId === exceptAccountId) {
        continue;
      }

      if (this.unicast(memberAccountId, buf, undefined)) {
        counter++;
      }
    }
    return counter;
  }

  async multicastToFriend(
    accountUUID: string,
    buf: ByteBuffer,
    activeFlags?: number | undefined, //FIXME: flags를 enum으로
  ): Promise<number> {
    let counter = 0;
    const duplexFriends = await this.service.getDuplexFriendsByUUID(
      accountUUID,
    );
    if (duplexFriends !== null) {
      for (const friend of duplexFriends) {
        if (
          activeFlags !== undefined &&
          (friend.activeFlags & activeFlags) !== activeFlags
        ) {
          continue;
        }

        if (this.unicastByAccountUUID(friend.uuid, buf, undefined)) {
          counter++;
        }
      }
    }
    return counter;
  }

  async getActiveStatus(accountUUID: string): Promise<ActiveStatusNumber> {
    const accountId = this.memberUUIDToId.get(accountUUID);
    if (accountId === undefined) {
      return ActiveStatusNumber.OFFLINE;
    }

    const clientSet = this.clients.get(accountId);
    if (clientSet === undefined) {
      return ActiveStatusNumber.OFFLINE;
    }

    if (
      [...clientSet].every(
        (e) => e.socketActiveStatus === ActiveStatusNumber.IDLE,
      )
    ) {
      return ActiveStatusNumber.IDLE;
    }

    return ActiveStatusNumber.ONLINE;
  }
}

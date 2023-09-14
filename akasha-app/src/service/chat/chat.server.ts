import { Injectable } from "@nestjs/common";
import { ChatWebSocket } from "./chat-websocket";
import { ByteBuffer, assert } from "akasha-lib";
import { ActiveStatusNumber } from "@common/generated/types";
import { Interval } from "@nestjs/schedule";
import { HANDSHAKE_TIMED_OUT } from "@common/websocket-private-closecode";

@Injectable()
export class ChatServer {
  private readonly temporaryClients = new Set<ChatWebSocket>();
  private readonly clients = new Map<string, Set<ChatWebSocket>>();

  constructor() {}

  async trackClientTemporary(client: ChatWebSocket): Promise<void> {
    this.temporaryClients.add(client);
  }

  async trackClient(client: ChatWebSocket): Promise<void> {
    assert(client.accountId !== undefined);
    assert(this.temporaryClients.delete(client));

    const id = client.accountId;
    const clientSet = this.clients.get(id);
    if (clientSet !== undefined) {
      clientSet.add(client);
    } else {
      this.clients.set(id, new Set<ChatWebSocket>([client]));
      await client.onFirstConnection();
    }
  }

  async untrackClient(client: ChatWebSocket): Promise<void> {
    if (client.handshakeState) {
      const id = client.accountId;
      const clientSet = this.clients.get(id);

      assert(clientSet !== undefined);
      assert(clientSet.delete(client));

      if (clientSet.size === 0) {
        await client.onLastDisconnect();
        this.clients.delete(id);
      }
    } else {
      assert(this.temporaryClients.delete(client));
    }
  }

  @Interval(10000)
  pruneTemporaryClient() {
    const now = Date.now();
    for (const temporaryClient of this.temporaryClients) {
      if (temporaryClient.connectionTime + 7000 < now) {
        temporaryClient.close(HANDSHAKE_TIMED_OUT);
      }
    }
  }

  sharedAction(
    id: string,
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
    id: string,
    buf: ByteBuffer,
    except?: ChatWebSocket | undefined,
  ): boolean {
    return this.sharedAction(id, (client) => client.sendPayload(buf), except);
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

  async getActiveStatus(id: string): Promise<ActiveStatusNumber> {
    const clientSet = this.clients.get(id);
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

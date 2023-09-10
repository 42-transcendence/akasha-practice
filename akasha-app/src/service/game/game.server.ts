import { Injectable } from "@nestjs/common";
import { GameWebSocket } from "./game-websocket";
import { ByteBuffer, assert } from "akasha-lib";
import { GameService } from "./game.service";
import { ActiveStatusNumber } from "@common/generated/types";

@Injectable()
export class GameServer {
  private readonly temporaryClients = new Set<GameWebSocket>();
  private readonly clients = new Map<string, Set<GameWebSocket>>();

  constructor(private readonly service: GameService) {}

  async trackClientTemporary(client: GameWebSocket): Promise<void> {
    this.temporaryClients.add(client);
  }

  async trackClient(client: GameWebSocket): Promise<void> {
    assert(client.accountId !== undefined);
    assert(this.temporaryClients.delete(client));

    const id = client.accountId;
    const clientSet = this.clients.get(id);
    if (clientSet !== undefined) {
      clientSet.add(client);
    } else {
      this.clients.set(id, new Set<GameWebSocket>([client]));
      await client.onFirstConnection();
    }
  }

  async untrackClient(client: GameWebSocket): Promise<void> {
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

  sharedAction(
    id: string,
    action: (client: GameWebSocket) => void,
    except?: GameWebSocket | undefined,
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
    except?: GameWebSocket | undefined,
  ): boolean {
    return this.sharedAction(id, (client) => client.sendPayload(buf), except);
  }

  broadcast(buf: ByteBuffer, except?: GameWebSocket | undefined): void {
    for (const [, clientSet] of this.clients) {
      for (const client of clientSet) {
        if (client !== except) {
          client.sendPayload(buf);
        }
      }
    }
  }

  async multicastToRoom(
    gameId: string,
    buf: ByteBuffer,
    exceptAccountId?: string | undefined,
  ): Promise<number> {
    let counter = 0;
    void this.service;
    //TODO: Not implemented
    void gameId;
    const memberSet = Array<string>();
    // const memberSet = await this.service.getRoomMemberSet(gameId);
    if (memberSet !== null) {
      for (const memberAccountId of memberSet) {
        if (memberAccountId === exceptAccountId) {
          continue;
        }

        if (this.unicast(memberAccountId, buf, undefined)) {
          counter++;
        }
      }
    }
    return counter;
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

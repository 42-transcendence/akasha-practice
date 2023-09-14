import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { ByteBuffer } from "akasha-lib";
import { ServerOptions } from "ws";
import { ServiceGatewayBase } from "@/service/service-gateway";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { GameService } from "./game.service";
import { GameWebSocket } from "./game-websocket";
import { GameServerOpcode } from "@common/game-opcodes";
import { GameServer } from "./game.server";
import { PacketHackException } from "@/service/packet-hack-exception";
import {
  BattleField,
  GameMatchmakeType,
  GameMode,
  GameRoomEnterResult,
  GameRoomParams,
  MatchmakeFailedReason,
  isValidLimit,
} from "@common/game-payloads";
import * as builder from "./game-payload-builder";
import { GameMatchmaker } from "./game.matchmaker";

@WebSocketGateway<ServerOptions>({
  path: "/game",
  verifyClient: verifyClientViaQueryParam("token"),
  WebSocket: GameWebSocket,
})
export class GameGateway extends ServiceGatewayBase<GameWebSocket> {
  constructor(
    private readonly server: GameServer,
    private readonly matchmaker: GameMatchmaker,
    private readonly gameService: GameService,
  ) {
    super();
  }

  override async handleServiceConnection(client: GameWebSocket): Promise<void> {
    await this.server.trackClientTemporary(client);
    client.injectProviders(this.server, this.gameService);
  }

  override async handleServiceDisconnect(client: GameWebSocket): Promise<void> {
    await this.server.untrackClient(client);
    if (client.matchmaking) {
      if (client.enqueued) {
        await this.matchmaker.matchDequeue(client.accountId);
        client.enqueued = false;
      }
    } else {
      if (client.gameId !== undefined) {
        await this.gameService.notifyDisconnect(
          client.accountId,
          client.gameId,
        );
      }
    }
  }

  private assertClient(value: unknown, message: string): asserts value {
    if (!value) {
      throw new PacketHackException(message);
    }
  }

  @SubscribeMessage(GameServerOpcode.HANDSHAKE_MATCHMAKE)
  async handleHandshakeMatchmake(client: GameWebSocket, payload: ByteBuffer) {
    this.assertClient(!client.handshakeState, "Duplicate handshake");
    await this.server.trackClient(client, true);

    const matchmakeType: GameMatchmakeType = payload.read1();
    switch (matchmakeType) {
      case GameMatchmakeType.QUEUE: {
        const reason = await this.matchmaker.matchEnqueue(client.accountId);
        if (reason !== undefined) {
          client.closePosted = true;
          return builder.makeMatchmakeFailed(reason);
        }

        client.enqueued = true;
        return builder.makeEnqueuedAlert(GameMatchmaker.params);
      }
      case GameMatchmakeType.CREATE: {
        if (await this.matchmaker.checkDuplicateSession(client.accountId)) {
          client.closePosted = true;
          return builder.makeMatchmakeFailed(MatchmakeFailedReason.DUPLICATE);
        }

        const battleField = payload.read4Unsigned();
        if (battleField >= BattleField.MAX_VALUE) {
          throw new PacketHackException(
            `Illegal battle field [${battleField}]`,
          );
        }
        const gameMode = payload.read1();
        if (gameMode >= GameMode.MAX_VALUE) {
          throw new PacketHackException(`Illegal game mode [${gameMode}]`);
        }
        const limit = payload.read2Unsigned();
        if (!isValidLimit(limit)) {
          throw new PacketHackException(`Illegal limit [${gameMode}]`);
        }
        const fair = payload.readBoolean();

        const params: GameRoomParams = {
          battleField,
          gameMode,
          limit,
          fair,
          ladder: false,
        };
        const invitation =
          await this.matchmaker.makeInvitationWithCreateNewRoom(
            client.accountId,
            params,
          );

        client.closePosted = true;
        return builder.makeInvitationPayload(invitation);
      }
      case GameMatchmakeType.ENTER: {
        if (await this.matchmaker.checkDuplicateSession(client.accountId)) {
          client.closePosted = true;
          return builder.makeMatchmakeFailed(MatchmakeFailedReason.DUPLICATE);
        }

        const entryCode = payload.readString();

        const invitation = await this.matchmaker.makeInvitationFromCode(
          client.accountId,
          entryCode,
        );

        if (invitation === null) {
          client.closePosted = true;
          return builder.makeMatchmakeFailed(MatchmakeFailedReason.NOT_FOUND);
        }
        client.closePosted = true;
        return builder.makeInvitationPayload(invitation);
      }
      case GameMatchmakeType.RESUME: {
        if (await this.matchmaker.checkDuplicateSession(client.accountId)) {
          client.closePosted = true;
          return builder.makeMatchmakeFailed(MatchmakeFailedReason.DUPLICATE);
        }

        const invitation = await this.matchmaker.makeInvitationForResume(
          client.accountId,
        );

        if (invitation === null) {
          client.closePosted = true;
          return builder.makeMatchmakeFailed(MatchmakeFailedReason.NOT_FOUND);
        }
        client.closePosted = true;
        return builder.makeInvitationPayload(invitation);
      }
      default: {
        throw new PacketHackException(
          `Illegal matchmake type [${matchmakeType}]`,
        );
      }
    }
  }

  @SubscribeMessage(GameServerOpcode.HANDSHAKE_GAME)
  async handleHandshakeGame(client: GameWebSocket, payload: ByteBuffer) {
    this.assertClient(!client.handshakeState, "Duplicate handshake");
    await this.server.trackClient(client, false);

    const invitation = payload.readString();

    const result = await this.gameService.acceptInvitation(
      client.accountId,
      invitation,
    );

    if (result.errno !== GameRoomEnterResult.SUCCESS) {
      client.closePosted = true;
      return builder.makeGameFailedPayload(result.errno);
    }
    return undefined;
  }
}

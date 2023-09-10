import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { ByteBuffer } from "akasha-lib";
import { ServerOptions } from "ws";
import { Logger } from "@nestjs/common";
import { ServiceGatewayBase } from "@/service/service-gateway";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { GameService } from "./game.service";
import { GameWebSocket } from "./game-websocket";
import { GameServerOpcode, GameClientOpcode } from "@common/game-opcodes";
import { GameServer } from "./game.server";
import { PacketHackException } from "@/service/packet-hack-exception";

@WebSocketGateway<ServerOptions>({
  path: "/game",
  verifyClient: verifyClientViaQueryParam("token"),
  WebSocket: GameWebSocket,
})
export class GameGateway extends ServiceGatewayBase<GameWebSocket> {
  constructor(
    private readonly server: GameServer,
    private readonly gameService: GameService,
  ) {
    super();
  }

  override async handleServiceConnection(client: GameWebSocket): Promise<void> {
    Logger.debug(
      `Connection GameWebSocket[${client.remoteAddress} -> ${client.remoteURL}]`,
    );

    client.injectProviders(this.server, this.gameService);
  }

  override async handleServiceDisconnect(client: GameWebSocket): Promise<void> {
    Logger.debug(
      `Disconnect GameWebSocket[${client.remoteAddress} -> ${client.remoteURL}]`,
    );
  }

  private assertClient(value: unknown, message: string): asserts value {
    if (!value) {
      throw new PacketHackException(message);
    }
  }

  @SubscribeMessage(GameServerOpcode.HANDSHAKE)
  handleHandshake(client: GameWebSocket, payload: ByteBuffer): ByteBuffer {
    this.assertClient(!client.handshakeState, "Duplicate handshake");
    void client, payload;
    const buf = ByteBuffer.createWithOpcode(GameClientOpcode.INITIALIZE);
    buf.writeDate(new Date());
    const count = crypto.getRandomValues(new Uint8Array(1))[0];
    buf.write4(count);
    for (let i = 0; i < count; i++) {
      buf.writeString(`Hello world! ${i}`);
    }
    return buf;
  }

  @SubscribeMessage(GameServerOpcode.TEST_ECHO_REQUEST)
  handleEcho_Test(client: GameWebSocket, payload: ByteBuffer): ByteBuffer {
    void client, payload;
    const str = payload.readString();
    const buf = ByteBuffer.createWithOpcode(
      GameClientOpcode.TEST_ECHO_RESPONSE,
    );
    buf.writeString(`Echo ${str}`);
    return buf;
  }
}

import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { ByteBuffer } from "akasha-lib";
import { ServerOptions } from "ws";
import { ServiceGatewayBase } from "@/service/service-gateway";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { GameWebSocket } from "./game-websocket";
import { GameOpcode } from "./game-opcode";

@WebSocketGateway<ServerOptions>({
  path: "/game",
  verifyClient: verifyClientViaQueryParam("token"),
  WebSocket: GameWebSocket,
})
export class GameGateway extends ServiceGatewayBase {
  @SubscribeMessage(GameOpcode.INITIALIZE)
  handleInitializeMessage(
    client: GameWebSocket,
    payload: ByteBuffer,
  ): ByteBuffer {
    void client, payload;
    const buf = ByteBuffer.createWithOpcode(0x00);
    buf.writeDate(new Date());
    const count = crypto.getRandomValues(new Uint8Array(1))[0];
    buf.write4(count);
    for (let i = 0; i < count; i++) {
      buf.writeString(`Hello world! ${i}`);
    }
    return buf;
  }

  @SubscribeMessage(GameOpcode.TEST)
  handleTestMessage(client: GameWebSocket, payload: ByteBuffer): ByteBuffer {
    void client, payload;
    const str = payload.readString();
    const buf = ByteBuffer.createWithOpcode(42);
    buf.writeString(`Echo ${str}`);
    return buf;
  }
}

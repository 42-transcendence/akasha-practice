import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { ByteBuffer } from "akasha-lib";
import { ServerOptions, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { GameWebSocket } from "./game-websocket";

@WebSocketGateway<ServerOptions>({
  path: "/game",
  verifyClient: verifyClientViaQueryParam("token"),
  WebSocket: GameWebSocket,
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  handleConnection(client: WebSocket, arg: IncomingMessage) {
    void client, arg;
  }

  handleDisconnect(client: WebSocket) {
    void client;
  }

  @SubscribeMessage(0)
  handleMessage_0(client: WebSocket, payload: ByteBuffer): ByteBuffer {
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

  @SubscribeMessage(42)
  handleMessage_42(client: WebSocket, payload: ByteBuffer): ByteBuffer {
    void client, payload;
    const str = payload.readString();
    const buf = ByteBuffer.createWithOpcode(42);
    buf.writeString(`Echo ${str}`);
    return buf;
  }
}

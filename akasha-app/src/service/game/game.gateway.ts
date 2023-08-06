import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { ByteBuffer } from "@libs/byte-buffer";
import { WebSocket } from "ws";

@WebSocketGateway({ path: "/game" })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  handleConnection(client: WebSocket, ...args: any[]) {
    void client, args;
  }

  handleDisconnect(client: WebSocket) {
    void client;
  }

  @SubscribeMessage(42)
  handleMessage_42(client: WebSocket, payload: ByteBuffer): ByteBuffer {
    void client, payload;
    const buf = ByteBuffer.createWithOpcode(42);
    buf.writeString("Hello world!");
    return buf;
  }
}

import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { ByteBuffer } from "akasha-lib";
import { ServerOptions } from "ws";
import { ServiceGatewayBase } from "@/service/service-gateway";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { ChatWebSocket } from "./chat-websocket";
import { ChatOpcode } from "./chat-opcode";

@WebSocketGateway<ServerOptions>({
  path: "/chat",
  verifyClient: verifyClientViaQueryParam("token"),
  WebSocket: ChatWebSocket,
})
export class ChatGateway extends ServiceGatewayBase {
  @SubscribeMessage(ChatOpcode.INITIALIZE)
  handleInitializeMessage(
    client: ChatWebSocket,
    payload: ByteBuffer,
  ): ByteBuffer {
    void client, payload;
    const buf = ByteBuffer.createWithOpcode(42);
    buf.writeString("Hello world!");
    return buf;
  }
}

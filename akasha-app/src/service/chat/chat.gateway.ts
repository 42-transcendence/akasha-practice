import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { ByteBuffer, NULL_UUID, assert } from "akasha-lib";
import { ServerOptions } from "ws";
import { Logger } from "@nestjs/common";
import { ServiceGatewayBase } from "@/service/service-gateway";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { ChatService } from "./chat.service";
import { ChatWebSocket } from "./chat-websocket";
import { ChatServerOpcode, ChatClientOpcode } from "./chat-opcode";

@WebSocketGateway<ServerOptions>({
  path: "/chat",
  verifyClient: verifyClientViaQueryParam("token"),
  WebSocket: ChatWebSocket,
})
export class ChatGateway extends ServiceGatewayBase<ChatWebSocket> {
  constructor(readonly chatService: ChatService) {
    super();
  }

  override async handleServiceConnection(client: ChatWebSocket): Promise<void> {
    Logger.debug(
      `Connection ChatWebSocket[${client.remoteAddress} -> ${client.remoteURL}]`,
    );

    client.injectChatService(this.chatService);
    await client.initialize();
    assert(client.record !== undefined);

    const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.TEST_RECORD);
    buf.writeUUID(client.record.uuid);
    client.sendPayload(buf);
  }

  override handleServiceDisconnect(client: ChatWebSocket): void {
    Logger.debug(
      `Disconnect ChatWebSocket[${client.remoteAddress} -> ${client.remoteURL}]`,
    );
  }

  @SubscribeMessage(ChatServerOpcode.HANDSHAKE)
  handleHandshake(client: ChatWebSocket, payload: ByteBuffer): ByteBuffer {
    void client, payload;
    const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.TEST_RECORD);
    buf.writeUUID(NULL_UUID);
    return buf;
  }
}

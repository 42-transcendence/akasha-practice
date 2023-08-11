import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer as IsWebSocketServer,
  OnGatewayConnection, OnGatewayDisconnect
} from "@nestjs/websockets";
import { ByteBuffer } from "@libs/byte-buffer";
import { WebSocketServer } from "ws";
import { ChatWebSocket } from "./chat-websocket";
import { ChatSocket } from "./chat.socket";
import { ChatOpCode } from "./utils/utils";

@WebSocketGateway({ path: "/chat", WebSocket: ChatWebSocket })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @IsWebSocketServer()
  server: WebSocketServer;

  private clients: ChatWebSocket[];

  constructor(private chatSocket: ChatSocket) {
    this.clients = [];
  }

  public handleConnection(client: ChatWebSocket) {
    this.clients.push(client);
  }

  public handleDisconnect(client: ChatWebSocket): void {
    for (let i = 0; i < this.clients.length; ++i) {
      if (this.clients[i] == client) {
        this.clients.splice(i, 1);
        break;
      }
    }
  }

  @SubscribeMessage(ChatOpCode.CONNECT)
  async connection(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatSocket.chatServerConnect(data, client);
  }

  @SubscribeMessage(ChatOpCode.INFO)
  async sendInfo(client: ChatWebSocket): Promise<ByteBuffer> {
    return await this.chatSocket.sendInfo(client);
  }

  @SubscribeMessage(ChatOpCode.FRIENDS)
  async sendFriends(client: ChatWebSocket): Promise<ByteBuffer> {
    return await this.chatSocket.sendFriends(client);
  }

  @SubscribeMessage(ChatOpCode.CREATE)
  async create(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatSocket.create(client, this.clients, data);
  }

  @SubscribeMessage(ChatOpCode.JOIN)
  async join(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatSocket.join(client, this.clients, data);
  }

  @SubscribeMessage(ChatOpCode.PUBLIC_SEARCH)
  async searchPubilcRoom(): Promise<ByteBuffer> {
    return await this.chatSocket.searchPubilcRoom();
  }

  @SubscribeMessage(ChatOpCode.INVITE)
  async invite(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatSocket.invite(client, this.clients, data);
  }

  @SubscribeMessage(ChatOpCode.ENTER)
  async enter(data: ByteBuffer): Promise<ByteBuffer> {
    return await this.chatSocket.enterRoom(data);
  }

  @SubscribeMessage(ChatOpCode.PART)
  async part(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatSocket.part(client, this.clients, data);
  }

  @SubscribeMessage(ChatOpCode.KICK)
  async kick(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatSocket.kick(client, this.clients, data);
  }

  @SubscribeMessage(ChatOpCode.CHAT)
  async chat(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatSocket.chat(client, this.clients, data);
  }

}

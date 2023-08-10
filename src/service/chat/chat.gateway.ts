import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer as IsWebSocketServer,
  OnGatewayConnection, OnGatewayDisconnect
} from "@nestjs/websockets";
import { ByteBuffer } from "@libs/byte-buffer";
import { WebSocketServer } from "ws";
import { ChatWebSocket } from "./chat-socket";
import { ChatService } from "./chat.service";
import { ChatOpCode } from "./utils/utils";

@WebSocketGateway({ path: "/chat" })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @IsWebSocketServer()
  server: WebSocketServer;

  private clients: ChatWebSocket[];

  constructor(private chatService: ChatService) {
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

  @SubscribeMessage(ChatOpCode.Connect)
  async connection(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatService.chatServerConnect(data, client);
  }

  @SubscribeMessage(ChatOpCode.Rooms)
  async sendRooms(client: ChatWebSocket): Promise<void> {
    await this.chatService.sendRooms(client);
  }

  @SubscribeMessage(ChatOpCode.Friends)
  async sendFriends(client: ChatWebSocket): Promise<void> {
    await this.chatService.sendFriends(client);
  }

  @SubscribeMessage(ChatOpCode.Create)
  async create(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatService.create(data, client, this.clients);
  }

  @SubscribeMessage(ChatOpCode.Join)
  async join(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatService.join(data, client, this.clients);
  }

  @SubscribeMessage(ChatOpCode.PublicSearch)
  async searchPubilcRoom(client: ChatWebSocket): Promise<void> {
    await this.chatService.searchPubilcRoom(client);
  }

  @SubscribeMessage(ChatOpCode.Invite)
  async invite(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatService.invite(client, this.clients, data);
  }

  @SubscribeMessage(ChatOpCode.Enter)
  async enter(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatService.enterRoom(data, client);
  }

  @SubscribeMessage(ChatOpCode.Part)
  async part(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatService.part(data, client, this.clients);
  }

  @SubscribeMessage(ChatOpCode.Kick)
  async kick(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatService.kick(data, client, this.clients);
  }

  @SubscribeMessage(ChatOpCode.Chat)
  async chat(client: ChatWebSocket, data: ByteBuffer): Promise<void> {
    await this.chatService.chat(data, client, this.clients);
  }

}

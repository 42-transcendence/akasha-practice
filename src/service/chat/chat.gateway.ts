import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer as IsWebSocketServer,
  OnGatewayConnection, OnGatewayDisconnect
} from "@nestjs/websockets";
import { ByteBuffer } from "@libs/byte-buffer";
import { WebSocketServer } from "ws";
import { ChatWebSocket } from "./chatSocket";
import { CommandService } from "./command/command.service";
import { ChatOpCode } from "./utils/utils";

@WebSocketGateway({ path: "/chat" })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @IsWebSocketServer()
  server: WebSocketServer;

  private clients: ChatWebSocket[];

  constructor(private commandService: CommandService) {
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
  async connection(client: ChatWebSocket, data: ByteBuffer): Promise<ByteBuffer> {
    await this.commandService.chatServerConnect(data, client);
    return data;
  }

  @SubscribeMessage(ChatOpCode.Rooms)
  async sendRooms(client: ChatWebSocket, data: ByteBuffer): Promise<ByteBuffer> {
    await this.commandService.sendRooms(client);
    return data;
  }

  @SubscribeMessage(ChatOpCode.Friends)
  async sendFriends(client: ChatWebSocket, data: ByteBuffer): Promise<ByteBuffer> {
    await this.commandService.sendFriends(client);
    return data;
  }

  @SubscribeMessage(ChatOpCode.Create)
  async create(client: ChatWebSocket, data: ByteBuffer): Promise<ByteBuffer> {
    await this.commandService.create(data, client, this.clients);
    return data;
  }

  @SubscribeMessage(ChatOpCode.Join)
  async join(client: ChatWebSocket, data: ByteBuffer): Promise<ByteBuffer> {
    await this.commandService.join(data, client, this.clients);
    return data;
  }

  @SubscribeMessage(ChatOpCode.PublicSearch)
  async searchPubilcRoom(client: ChatWebSocket, data: ByteBuffer): Promise<ByteBuffer> {
    await this.commandService.searchPubilcRoom(client);
    return data;
  }

  @SubscribeMessage(ChatOpCode.Invite)
  async invite(client: ChatWebSocket, data: ByteBuffer): Promise<ByteBuffer> {
    await this.commandService.invite(client, this.clients, data);
    return data;
  }

  @SubscribeMessage(ChatOpCode.Enter)
  async enter(client: ChatWebSocket, data: ByteBuffer): Promise<ByteBuffer> {
    await this.commandService.enterRoom(data, client);
    return data;
  }

  @SubscribeMessage(ChatOpCode.Part)
  async part(client: ChatWebSocket, data: ByteBuffer): Promise<ByteBuffer> {
    await this.commandService.part(data, client, this.clients);
    return data;
  }

  @SubscribeMessage(ChatOpCode.Kick)
  async kick(client: ChatWebSocket, data: ByteBuffer): Promise<ByteBuffer> {
    await this.commandService.kick(data, client, this.clients);
    return data;
  }

  @SubscribeMessage(ChatOpCode.Chat)
  async chat(client: ChatWebSocket, data: ByteBuffer): Promise<ByteBuffer> {
    await this.commandService.chat(data, client, this.clients);
    return data;
  }

}

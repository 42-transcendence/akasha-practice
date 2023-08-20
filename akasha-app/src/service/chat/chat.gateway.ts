import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { ByteBuffer, assert } from "akasha-lib";
import { ServerOptions } from "ws";
import { Logger } from "@nestjs/common";
import { ServiceGatewayBase } from "@/service/service-gateway";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { ChatService } from "./chat.service";
import { ChatWebSocket } from "./chat-websocket";
import { ChatServerOpcode, ChatClientOpcode } from "./chat-opcodes";
import { ChatRoomEntry, writeChatRoom } from "./chat-payloads";
import { AccountsService } from "@/user/accounts/accounts.service";
import { AuthLevel } from "@/user/auth/auth-payload";

@WebSocketGateway<ServerOptions>({
  path: "/chat",
  verifyClient: verifyClientViaQueryParam("token"),
  WebSocket: ChatWebSocket,
})
export class ChatGateway extends ServiceGatewayBase<ChatWebSocket> {
  constructor(
    private readonly chatService: ChatService,
    private readonly accounts: AccountsService,
  ) {
    super();
  }

  override handleServiceConnection(client: ChatWebSocket): void {
    Logger.debug(
      `Connection ChatWebSocket[${client.remoteAddress} -> ${client.remoteURL}]`,
    );

    this.chatService.trackClientTemporary(client);
    client.injectChatService(this.chatService);
  }

  override handleServiceDisconnect(client: ChatWebSocket): void {
    Logger.debug(
      `Disconnect ChatWebSocket[${client.remoteAddress} -> ${client.remoteURL}]`,
    );

    this.chatService.untrackClient(client);
  }

  @SubscribeMessage(ChatServerOpcode.HANDSHAKE)
  async handleHandshake(client: ChatWebSocket) {
    assert(client.record === undefined);
    assert(client.auth.auth_level === AuthLevel.COMPLETED);

    const uuid = client.auth.user_id;
    const id = await this.accounts.loadAccountIdByUUID(uuid);
    client.record = { uuid, id };
    this.chatService.trackClient(client);

    const chatRoomList: ChatRoomEntry[] =
      await this.chatService.loadOwnRoomListByAccountId(id);

    const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.OWN_ROOM_LIST);
    buf.writeUUID(uuid);
    buf.writeArray(chatRoomList, writeChatRoom);
    return buf;
  }

  @SubscribeMessage(ChatServerOpcode.ADD_FRIEND)
  async handleAddFriend(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.record !== undefined);

    const viaUUID: boolean = payload.readBoolean();
    if (viaUUID) {
      const targetUUID: string = payload.readUUID();
      void targetUUID; //FIXME: service
    } else {
      const targetNickName: string = payload.readString();
      const targetNickTag: number = payload.read4Unsigned();
      void targetNickName, targetNickTag; //FIXME: service
    }
  }

  @SubscribeMessage(ChatServerOpcode.MODIFY_FRIEND)
  async handleModifyFriend(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.record !== undefined);

    const targetUUID: string = payload.readUUID();
    void targetUUID; //FIXME: service
    const modifyFlag: number = payload.read1();
    if ((modifyFlag & 1) !== 0) {
      const groupName: string = payload.readString();
      void groupName; //FIXME: service
    }
    if ((modifyFlag & 2) !== 0) {
      const activeFlags: number = payload.read1();
      void activeFlags; //FIXME: service
    }
  }

  @SubscribeMessage(ChatServerOpcode.DELETE_FRIEND)
  async handleDeleteFriend(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.record !== undefined);

    const targetUUID: string = payload.readUUID();
    void targetUUID; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.PUBLIC_ROOM_LIST_REQUEST)
  async handlePublicRoomListRequest(client: ChatWebSocket) {
    assert(client.record !== undefined);

    void 0; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.CREATE_ROOM)
  async handleCreateRoom(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.record !== undefined);

    void payload; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.ENTER_ROOM)
  async handleEnterRoom(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.record !== undefined);

    void payload; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.LEAVE_ROOM)
  async handleLeaveRoom(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.record !== undefined);

    void payload; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.INVITE_USER)
  async handleInviteUser(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.record !== undefined);

    void payload; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.CHAT_MESSAGE)
  async handleChatMessage(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.record !== undefined);

    void payload; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.SYNC_CURSOR)
  async handleSyncCursor(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.record !== undefined);

    void payload; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.MUTE_MEMBER)
  async handleMuteMember(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.record !== undefined);

    void payload; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.KICK_MEMBER)
  async handleKickMember(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.record !== undefined);

    void payload; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.BAN_MEMBER)
  async handleBanMember(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.record !== undefined);

    void payload; //FIXME: service
  }
}

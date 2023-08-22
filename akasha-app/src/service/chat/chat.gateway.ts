import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { ByteBuffer, assert } from "akasha-lib";
import { ServerOptions } from "ws";
import { Logger } from "@nestjs/common";
import { ServiceGatewayBase } from "@/service/service-gateway";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { ChatService } from "./chat.service";
import { ChatWebSocket } from "./chat-websocket";
import { ChatServerOpcode, ChatClientOpcode } from "./chat-opcodes";
import {
  ChatMemberModeFlags,
  ChatRoomEntry,
  ChatRoomModeFlags,
  writeChatMessage,
  writeChatRoom,
} from "./chat-payloads";
import { AccountsService } from "@/user/accounts/accounts.service";
import { AuthLevel } from "@/user/auth/auth-payloads";
import { PacketHackException } from "@/service/packet-hack-exception";

export const MAX_MEMBER_CAPACITY = 50000;

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

  private assertClient(value: unknown, message: string): asserts value {
    if (!value) {
      throw new PacketHackException(message);
    }
  }

  @SubscribeMessage(ChatServerOpcode.HANDSHAKE)
  async handleHandshake(client: ChatWebSocket) {
    assert(client.auth.auth_level === AuthLevel.COMPLETED);
    this.assertClient(client.account === undefined, "Duplicate handshake");

    const uuid = client.auth.user_id;
    const id = await this.accounts.loadAccountIdByUUID(uuid);
    client.account = { uuid, id };
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
    this.assertClient(client.account !== undefined, "Invalid state");

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
    this.assertClient(client.account !== undefined, "Invalid state");

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
    this.assertClient(client.account !== undefined, "Invalid state");

    const targetUUID: string = payload.readUUID();
    void targetUUID; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.ADD_ENEMY)
  async handleAddEnemy(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

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

  @SubscribeMessage(ChatServerOpcode.MODIFY_ENEMY)
  async handleModifyEnemy(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const targetUUID: string = payload.readUUID();
    void targetUUID; //FIXME: service
    const memo: string = payload.readString();
    void memo; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.DELETE_ENEMY)
  async handleDeleteEnemy(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const targetUUID: string = payload.readUUID();
    void targetUUID; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.PUBLIC_ROOM_LIST_REQUEST)
  async handlePublicRoomListRequest(client: ChatWebSocket) {
    this.assertClient(client.account !== undefined, "Invalid state");

    void 0; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.CREATE_ROOM)
  async handleCreateRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const title = payload.readString();
    const modeFlagsClient = payload.read1();
    let modeFlags = 0;
    let password: string = "";
    const isPrivate = (modeFlagsClient & ChatRoomModeFlags.PRIVATE) !== 0;
    if (isPrivate) {
      password = payload.readString();
      //NOTE: password에 대하여 유효한 bcrypt 검사
      modeFlags |= ChatRoomModeFlags.PRIVATE;
    }
    const isSecret = (modeFlagsClient & ChatRoomModeFlags.SECRET) !== 0;
    if (isSecret) {
      modeFlags |= ChatRoomModeFlags.SECRET;
    }
    const limit = payload.read2Unsigned();
    if (limit == 0 || limit > MAX_MEMBER_CAPACITY) {
      throw new PacketHackException(
        `${ChatGateway.name}: ${this.handleCreateRoom.name}: Illegal limit [${limit}]`,
      );
    }
    const memberUUIDs = payload.readArray(payload.readUUID);
    if (memberUUIDs.length > limit) {
      throw new PacketHackException(
        `${ChatGateway.name}: ${this.handleCreateRoom.name}: Exceed limit [${limit}], member count [${memberUUIDs.length}]`,
      );
    }
    const ownerUUID = client.account.uuid;
    if (!memberUUIDs.includes(ownerUUID)) {
      throw new PacketHackException(
        `${ChatGateway.name}: ${this.handleCreateRoom.name}: Member without owner`,
      );
    }
    const members = memberUUIDs.map((e) => ({
      uuid: e,
      modeFlags: e === ownerUUID ? ChatMemberModeFlags.ADMIN : 0,
    }));
    //FIXME: 차단한 상대가 유저를 채팅방을 만들 때 초대할 수 있음?

    const result = await this.chatService.createNewRoom({
      title,
      modeFlags,
      password,
      limit,
      members,
    });

    const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.INSERT_ROOM);
    writeChatRoom(result, buf);

    this.chatService.multicastToRoom(result.uuid, buf);
  }

  @SubscribeMessage(ChatServerOpcode.ENTER_ROOM)
  async handleEnterRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const roomUUID = payload.readUUID();
    //FIXME: 존재하지 않는 채팅방 혹은 이미 입장한 채팅방
    const password = payload.readString();
    //FIXME: password 검사
    void password;
    //FIXME: 이미 꽉 찬 채팅방
    this.chatService.insertChatMember(roomUUID, client.account.id);
    //FIXME: unicast
  }

  @SubscribeMessage(ChatServerOpcode.LEAVE_ROOM)
  async handleLeaveRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const roomUUID = payload.readUUID();
    //FIXME: 입장하지 않은 채팅방
    //FIXME: 방장은 나갈 수 없게 혹은 자동으로 양도
    this.chatService.deleteChatMember(roomUUID, client.account.id);
    //FIXME: unicast
  }

  @SubscribeMessage(ChatServerOpcode.INVITE_USER)
  async handleInviteUser(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    //FIXME: 상대가 차단하여 초대할 수 없음
    void payload; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.CHAT_MESSAGE)
  async handleChatMessage(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const roomUUID = payload.readUUID();
    //FIXME: 없는 방, 채팅금지 상태
    const content = payload.readString();
    //FIXME: 내용이 malicious

    const message = await this.chatService.createNewChatMessage(
      roomUUID,
      client.account.id,
      content,
    );

    const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.CHAT_MESSAGE);
    writeChatMessage(message, buf);

    this.chatService.multicastToRoom(roomUUID, buf);
  }

  @SubscribeMessage(ChatServerOpcode.SYNC_CURSOR)
  async handleSyncCursor(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const lastMessageId = payload.readUUID();
    this.chatService.updateLastMessageCursor(client.account.id, lastMessageId);

    const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.SYNC_CURSOR);
    buf.writeUUID(lastMessageId);

    this.chatService.unicast(client.account.id, buf, client);
  }

  @SubscribeMessage(ChatServerOpcode.MUTE_MEMBER)
  async handleMuteMember(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const roomUUID = payload.readUUID();
    void roomUUID; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.KICK_MEMBER)
  async handleKickMember(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const roomUUID = payload.readUUID();
    void roomUUID; //FIXME: service
  }
}

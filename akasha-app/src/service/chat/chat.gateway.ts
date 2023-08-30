import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { ByteBuffer, assert } from "akasha-lib";
import { ServerOptions } from "ws";
import { Logger } from "@nestjs/common";
import { ServiceGatewayBase } from "@/service/service-gateway";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import {
  ChatService,
  toChatMemberEntry,
  toChatRoomEntry,
} from "./chat.service";
import { ChatWebSocket } from "./chat-websocket";
import { ChatServerOpcode, ChatClientOpcode } from "@common/chat-opcodes";
import {
  ChatMemberModeFlags,
  ChatMessageEntry,
  ChatRoomChatMessagePairEntry,
  ChatRoomEntry,
  ChatRoomModeFlags,
  SocialPayload,
  readChatRoomChatMessagePair,
  writeChatMessage,
  writeChatRoom,
  writeChatRoomMember,
  writeChatRoomView,
  writeSocialPayload,
} from "@common/chat-payloads";
import { AccountsService } from "@/user/accounts/accounts.service";
import { AuthLevel } from "@common/auth-payloads";
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
  async handleHandshake(client: ChatWebSocket, payload: ByteBuffer) {
    assert(client.auth.auth_level === AuthLevel.COMPLETED);
    this.assertClient(client.account === undefined, "Duplicate handshake");

    const uuid = client.auth.user_id;
    const id = await this.accounts.findAccountIdByUUID(uuid);
    client.account = { uuid, id };
    this.chatService.trackClient(client);

    const fetchedMessageIdPairs: ChatRoomChatMessagePairEntry[] =
      payload.readArray(readChatRoomChatMessagePair);

    const fetchedMessageIdMap = fetchedMessageIdPairs.reduce(
      (map, e) => map.set(e.uuid, e.messageUUID),
      new Map<string, string>(),
    );

    const chatRoomList: ChatRoomEntry[] =
      await this.chatService.loadOwnRoomListByAccountId(id);
    const chatMessageMap = new Map<string, ChatMessageEntry[]>();
    for (const chatRoom of chatRoomList) {
      const roomUUID = chatRoom.uuid;
      chatMessageMap.set(
        roomUUID,
        await this.chatService.loadMessagesAfter(
          roomUUID,
          fetchedMessageIdMap.get(roomUUID),
        ),
      );
    }
    const socialPayload: SocialPayload =
      await this.chatService.loadSocialByAccountId(id);

    const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.INITIALIZE);
    buf.writeArray(chatRoomList, writeChatRoom);
    buf.writeLength(chatMessageMap.size);
    for (const [key, val] of chatMessageMap) {
      buf.writeUUID(key);
      buf.writeArray(val, writeChatMessage);
    }
    writeSocialPayload(socialPayload, buf);
    return buf;
  }

  @SubscribeMessage(ChatServerOpcode.ADD_FRIEND)
  async handleAddFriend(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const viaUUID = payload.readBoolean();
    if (viaUUID) {
      const targetUUID = payload.readUUID();
      void targetUUID; //FIXME: service
    } else {
      const targetNickName = payload.readString();
      const targetNickTag = payload.read4Unsigned();
      void targetNickName, targetNickTag; //FIXME: service
    }
  }

  @SubscribeMessage(ChatServerOpcode.MODIFY_FRIEND)
  async handleModifyFriend(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const targetUUID = payload.readUUID();
    void targetUUID; //FIXME: service
    const modifyFlag = payload.read1();
    if ((modifyFlag & 1) !== 0) {
      const groupName = payload.readString();
      void groupName; //FIXME: service
    }
    if ((modifyFlag & 2) !== 0) {
      const activeFlags = payload.read1();
      void activeFlags; //FIXME: service
    }
  }

  @SubscribeMessage(ChatServerOpcode.DELETE_FRIEND)
  async handleDeleteFriend(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const targetUUID = payload.readUUID();
    void targetUUID; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.ADD_ENEMY)
  async handleAddEnemy(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const viaUUID = payload.readBoolean();
    if (viaUUID) {
      const targetUUID = payload.readUUID();
      void targetUUID; //FIXME: service
    } else {
      const targetNickName = payload.readString();
      const targetNickTag = payload.read4Unsigned();
      void targetNickName, targetNickTag; //FIXME: service
    }
  }

  @SubscribeMessage(ChatServerOpcode.MODIFY_ENEMY)
  async handleModifyEnemy(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const targetUUID = payload.readUUID();
    void targetUUID; //FIXME: service
    const memo = payload.readString();
    void memo; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.DELETE_ENEMY)
  async handleDeleteEnemy(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const targetUUID = payload.readUUID();
    void targetUUID; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.PUBLIC_ROOM_LIST_REQUEST)
  async handlePublicRoomListRequest(client: ChatWebSocket) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const chatRoomViewList = await this.chatService.loadPublicRoomList();

    const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.PUBLIC_ROOM_LIST);
    buf.writeArray(chatRoomViewList, writeChatRoomView);
    return buf;
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
      modeFlags |= ChatRoomModeFlags.PRIVATE;
    }
    const isSecret = (modeFlagsClient & ChatRoomModeFlags.SECRET) !== 0;
    if (isSecret) {
      password = payload.readString();
      //NOTE: password에 대하여 유효한 bcrypt 검사
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

    const bufRoom = ByteBuffer.createWithOpcode(ChatClientOpcode.INSERT_ROOM);
    writeChatRoom(toChatRoomEntry(result), bufRoom);

    this.chatService.multicastToRoom(result.uuid, bufRoom);

    //FIXME: 실패한 이유
    const success = true;
    const errorReason = 1;

    const buf = ByteBuffer.createWithOpcode(
      ChatClientOpcode.CREATE_ROOM_FAILED,
    );
    buf.write1(success ? 0 : errorReason);
    return buf;
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
    const member = await this.chatService.insertChatMember(
      roomUUID,
      client.account.id,
    );
    const success = member !== null;

    if (success) {
      const bufSelf = ByteBuffer.createWithOpcode(ChatClientOpcode.INSERT_ROOM);
      writeChatRoom(toChatRoomEntry(member.chat), bufSelf);
      this.chatService.unicast(client.account.id, bufSelf);

      //FIXME: self 기준으로 self가 이미 포함된 채팅방을 받은 이후에 또 self를 추가하려고 할 수 있음.
      const bufRoom = ByteBuffer.createWithOpcode(
        ChatClientOpcode.INSERT_ROOM_MEMBER,
      );
      bufRoom.writeUUID(roomUUID);
      writeChatRoomMember(toChatMemberEntry(member), bufRoom);
      this.chatService.multicastToRoom(roomUUID, bufRoom);

      //FIXME: 이런식으로 메시지를 만들면 안될거 같은데...
      const bufRoomMessage = ByteBuffer.createWithOpcode(
        ChatClientOpcode.CHAT_MESSAGE,
      );
      const message = await this.chatService.createNewChatMessage(
        roomUUID,
        client.account.id,
        `${client.account.uuid}님이 입장했습니다.`,
        1, //FIXME: 입장 메시지 타입
      );
      writeChatMessage(message, bufRoomMessage);
      this.chatService.multicastToRoom(roomUUID, bufRoomMessage);
    }

    //FIXME: 실패한 이유
    const errorReason = 1;

    const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.ENTER_ROOM_FAILED);
    buf.write1(success ? 0 : errorReason);
    return buf;
  }

  @SubscribeMessage(ChatServerOpcode.LEAVE_ROOM)
  async handleLeaveRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const roomUUID = payload.readUUID();
    //FIXME: 입장하지 않은 채팅방
    //FIXME: 방장은 나갈 수 없게 혹은 자동으로 양도
    const success = await this.chatService.deleteChatMember(
      roomUUID,
      client.account.id,
    );

    if (success) {
      const bufSelf = ByteBuffer.createWithOpcode(ChatClientOpcode.REMOVE_ROOM);
      bufSelf.writeUUID(roomUUID);
      this.chatService.unicast(client.account.id, bufSelf);

      const bufRoom = ByteBuffer.createWithOpcode(
        ChatClientOpcode.INSERT_ROOM_MEMBER,
      );
      bufRoom.writeUUID(roomUUID);
      bufRoom.writeUUID(client.account.uuid);
      this.chatService.multicastToRoom(roomUUID, bufRoom);

      //FIXME: 이런식으로 메시지를 만들면 안될거 같은데...
      const bufRoomMessage = ByteBuffer.createWithOpcode(
        ChatClientOpcode.CHAT_MESSAGE,
      );
      const message = await this.chatService.createNewChatMessage(
        roomUUID,
        client.account.id,
        `${client.account.uuid}님이 퇴장했습니다.`,
        2, //FIXME: 입장 메시지 타입
      );
      writeChatMessage(message, bufRoomMessage);
      this.chatService.multicastToRoom(roomUUID, bufRoomMessage);
    }

    //FIXME: 실패한 이유
    const errorReason = 1;

    const buf = ByteBuffer.createWithOpcode(ChatClientOpcode.LEAVE_ROOM_FAILED);
    buf.write1(success ? 0 : errorReason);
    return buf;
  }

  @SubscribeMessage(ChatServerOpcode.INVITE_USER)
  async handleInviteUser(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const roomUUID: string = payload.readUUID();
    //FIXME: 없는 상대 혹은 상대가 차단하여 초대할 수 없음
    const targetUUID: string = payload.readUUID();
    //FIXME: 존재하지 않는 채팅방 혹은 이미 입장한 채팅방
    const password = payload.readString();
    //FIXME: password 검사
    void password;
    //FIXME: 이미 꽉 찬 채팅방
    const member = await this.chatService.insertChatMemberByUUID(
      roomUUID,
      targetUUID,
    );
    const success = member !== null;

    if (member !== null) {
      const bufSelf = ByteBuffer.createWithOpcode(ChatClientOpcode.INSERT_ROOM);
      writeChatRoom(toChatRoomEntry(member.chat), bufSelf);
      this.chatService.unicast(client.account.id, bufSelf);

      const bufRoom = ByteBuffer.createWithOpcode(
        ChatClientOpcode.INSERT_ROOM_MEMBER,
      );
      bufRoom.writeUUID(roomUUID);
      writeChatRoomMember(toChatMemberEntry(member), bufRoom);
      this.chatService.multicastToRoom(roomUUID, bufRoom);

      //FIXME: 이런식으로 메시지를 만들면 안될거 같은데...
      const bufRoomMessage = ByteBuffer.createWithOpcode(
        ChatClientOpcode.CHAT_MESSAGE,
      );
      const message = await this.chatService.createNewChatMessage(
        roomUUID,
        client.account.id,
        `${targetUUID}님을 초대했습니다.`,
        4, //FIXME: 입장 메시지 타입
      );
      writeChatMessage(message, bufRoomMessage);
      this.chatService.multicastToRoom(roomUUID, bufRoomMessage);
    }

    //FIXME: 실패한 이유
    const errorReason = 1;

    const buf = ByteBuffer.createWithOpcode(
      ChatClientOpcode.INVITE_USER_FAILED,
    );
    buf.write1(success ? 0 : errorReason);
    return buf;
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

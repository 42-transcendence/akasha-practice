import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { ByteBuffer, NULL_UUID, assert } from "akasha-lib";
import { ServerOptions } from "ws";
import { ServiceGatewayBase } from "@/service/service-gateway";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { ChatService } from "./chat.service";
import { ChatWebSocket } from "./chat-websocket";
import { ChatServerOpcode } from "@common/chat-opcodes";
import {
  ChatRoomChatMessagePairEntry,
  FriendActiveFlags,
  FriendErrorNumber,
  FriendModifyFlags,
  RoomErrorNumber,
  fromChatRoomModeFlags,
  readChatRoomChatMessagePair,
} from "@common/chat-payloads";
import { PacketHackException } from "@/service/packet-hack-exception";
import {
  CHAT_ROOM_TITLE_REGEX,
  MAX_CHAT_MEMBER_CAPACITY,
} from "@common/chat-constants";
import * as builder from "./chat-payload-builder";
import { ChatServer } from "./chat.server";
import {
  ActiveStatusNumber,
  MessageTypeNumber,
  Role,
  RoleNumber,
} from "@common/generated/types";
import { NICK_NAME_REGEX } from "@common/profile-constants";

@WebSocketGateway<ServerOptions>({
  path: "/chat",
  verifyClient: verifyClientViaQueryParam("token"),
  WebSocket: ChatWebSocket,
})
export class ChatGateway extends ServiceGatewayBase<ChatWebSocket> {
  constructor(
    private readonly server: ChatServer,
    private readonly chatService: ChatService,
  ) {
    super();
  }

  override async handleServiceConnection(client: ChatWebSocket): Promise<void> {
    await this.server.trackClientTemporary(client);
    client.injectProviders(this.server, this.chatService);
  }

  override async handleServiceDisconnect(client: ChatWebSocket): Promise<void> {
    await this.server.untrackClient(client);
  }

  private assertClient(value: unknown, message: string): asserts value {
    if (!value) {
      throw new PacketHackException(message);
    }
  }

  @SubscribeMessage(ChatServerOpcode.HANDSHAKE)
  async handleHandshake(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(!client.handshakeState, "Duplicate handshake");
    await this.server.trackClient(client);
    client.handshakeState = true;

    const fetchedMessageIdPairs: ChatRoomChatMessagePairEntry[] =
      payload.readArray(readChatRoomChatMessagePair);

    const init = await client.initialize(fetchedMessageIdPairs);

    return builder.makeInitializePayload(
      init.chatRoomList,
      init.chatMessageMap,
      init.socialPayload,
    );
  }

  @SubscribeMessage(ChatServerOpcode.ACTIVE_STATUS_MANUAL)
  async handleActiveStatus(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const activeStatus = payload.read1();
    switch (activeStatus) {
      case ActiveStatusNumber.ONLINE:
      case ActiveStatusNumber.IDLE:
      case ActiveStatusNumber.DO_NOT_DISTURB:
      case ActiveStatusNumber.INVISIBLE:
        break;
      default:
        throw new PacketHackException(
          `${ChatGateway.name}: ${this.handleActiveStatus.name}: Illegal active status [${activeStatus}]`,
        );
    }

    const prevActiveStatus = await this.chatService.getActiveStatus(
      client.accountId,
    );
    if (prevActiveStatus !== activeStatus) {
      this.chatService.setActiveStatus(client.accountId, activeStatus);
      if (
        (prevActiveStatus === ActiveStatusNumber.INVISIBLE) !==
        (activeStatus === ActiveStatusNumber.INVISIBLE)
      ) {
        this.chatService.setActiveTimestamp(client.accountId, true);
      }
      this.server.multicastToFriend(
        client.accountId,
        builder.makeUpdateFriendActiveStatus(client.accountId),
        FriendActiveFlags.SHOW_ACTIVE_STATUS,
      );
    }
  }

  @SubscribeMessage(ChatServerOpcode.IDLE_AUTO)
  async handleIdleAuto(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const idle = payload.readBoolean();

    client.socketActiveStatus = idle
      ? ActiveStatusNumber.IDLE
      : ActiveStatusNumber.ONLINE;
    this.server.multicastToFriend(
      client.accountId,
      builder.makeUpdateFriendActiveStatus(client.accountId),
      FriendActiveFlags.SHOW_ACTIVE_STATUS,
    );
  }

  @SubscribeMessage(ChatServerOpcode.ADD_FRIEND)
  async handleAddFriend(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const lookup = payload.readBoolean();
    let targetAccountId: string | null;
    if (lookup) {
      const targetNickName = payload.readString();
      if (!NICK_NAME_REGEX.test(targetNickName)) {
        throw new PacketHackException(
          `${ChatGateway.name}: ${this.handleAddFriend.name}: Illegal targetNickName [${targetNickName}]`,
        );
      }
      const targetNickTag = payload.read4Unsigned();
      targetAccountId = await this.chatService.getAccountIdByNick(
        targetNickName,
        targetNickTag,
      );
    } else {
      targetAccountId = payload.readUUID();
    }
    const groupName = payload.readString();
    const activeFlags = payload.read1();

    const result = await this.chatService.addFriend(
      client.accountId,
      targetAccountId,
      groupName,
      activeFlags,
    );
    if (result.errno !== FriendErrorNumber.SUCCESS) {
      return builder.makeAddFriendFailedResult(result.errno);
    }
    assert(targetAccountId !== null);
    const { friend } = result;
    if (
      await this.chatService.isDuplexFriend(client.accountId, targetAccountId)
    ) {
      void this.server.unicast(
        targetAccountId,
        builder.makeUpdateFriendActiveStatus(client.accountId),
      );
    } else {
      void this.server.unicast(
        targetAccountId,
        builder.makeFriendRequest(client.accountId),
      );
    }
    void this.server.unicast(
      client.accountId,
      builder.makeAddFriendSuccessResult(friend),
    );

    return undefined;
  }

  @SubscribeMessage(ChatServerOpcode.MODIFY_FRIEND)
  async handleModifyFriend(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const targetAccountId = payload.readUUID();
    const modifyFlags = payload.read1();
    let groupName: string | undefined;
    if ((modifyFlags & FriendModifyFlags.MODIFY_GROUP_NAME) !== 0) {
      groupName = payload.readString();
    }
    let activeFlags: number | undefined;
    if ((modifyFlags & FriendModifyFlags.MODIFY_ACTIVE_FLAGS) !== 0) {
      activeFlags = payload.read1();
    }

    const result = await this.chatService.modifyFriend(
      client.accountId,
      targetAccountId,
      groupName,
      activeFlags,
    );
    if (result.errno !== FriendErrorNumber.SUCCESS) {
      return builder.makeModifyFriendFailedResult(result.errno);
    }
    const { friend } = result;
    void this.server.unicast(
      targetAccountId,
      builder.makeUpdateFriendActiveStatus(client.accountId),
    );
    void this.server.unicast(
      client.accountId,
      builder.makeModifyFriendSuccessResult(targetAccountId, friend),
    );

    return undefined;
  }

  @SubscribeMessage(ChatServerOpcode.DELETE_FRIEND)
  async handleDeleteFriend(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const targetAccountId = payload.readUUID();

    const [errno, forward, reverse] = await this.chatService.deleteFriend(
      client.accountId,
      targetAccountId,
    );
    if (errno !== FriendErrorNumber.SUCCESS) {
      return builder.makeDeleteFriendFailedResult(errno);
    }
    assert(forward === undefined || reverse !== undefined);
    void this.server.unicast(
      targetAccountId,
      builder.makeDeleteFriendSuccessResult(
        client.accountId,
        reverse === undefined,
      ),
    );
    void this.server.unicast(
      client.accountId,
      builder.makeDeleteFriendSuccessResult(
        targetAccountId,
        forward === undefined,
      ),
    );

    return undefined;
  }

  @SubscribeMessage(ChatServerOpcode.ADD_ENEMY)
  async handleAddEnemy(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const viaUUID = payload.readBoolean();
    if (viaUUID) {
      const targetAccountId = payload.readUUID();
      void targetAccountId; //FIXME: service
    } else {
      const targetNickName = payload.readString();
      const targetNickTag = payload.read4Unsigned();
      void targetNickName, targetNickTag; //FIXME: service
    }
  }

  @SubscribeMessage(ChatServerOpcode.MODIFY_ENEMY)
  async handleModifyEnemy(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const targetAccountId = payload.readUUID();
    void targetAccountId; //FIXME: service
    const memo = payload.readString();
    void memo; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.DELETE_ENEMY)
  async handleDeleteEnemy(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const targetAccountId = payload.readUUID();
    void targetAccountId; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.PUBLIC_ROOM_LIST_REQUEST)
  async handlePublicRoomListRequest(client: ChatWebSocket) {
    this.assertClient(client.handshakeState, "Invalid state");

    const chatRoomViewList = await this.chatService.loadPublicRoomList();

    return builder.makePublicRoomList(chatRoomViewList);
  }

  @SubscribeMessage(ChatServerOpcode.CREATE_ROOM)
  async handleCreateRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const title = payload.readString();
    if (!CHAT_ROOM_TITLE_REGEX.test(title)) {
      throw new PacketHackException(
        `${ChatGateway.name}: ${this.handleCreateRoom.name}: Illegal title [${title}]`,
      );
    }
    const modeFlags = fromChatRoomModeFlags(payload.read1());
    let password: string = "";
    if (modeFlags.isSecret) {
      password = payload.readString();
      //NOTE: password에 대하여 유효한 bcrypt 검사
    }
    const limit = payload.read2Unsigned();
    if (limit == 0 || limit > MAX_CHAT_MEMBER_CAPACITY) {
      throw new PacketHackException(
        `${ChatGateway.name}: ${this.handleCreateRoom.name}: Illegal limit [${limit}]`,
      );
    }
    const targetAccountIdList = payload.readArray(payload.readUUID);
    if (targetAccountIdList.length > limit) {
      throw new PacketHackException(
        `${ChatGateway.name}: ${this.handleCreateRoom.name}: Exceed limit [${limit}], member count [${targetAccountIdList.length}]`,
      );
    }

    const ownerAccountId = client.accountId;
    if (!targetAccountIdList.includes(ownerAccountId)) {
      throw new PacketHackException(
        `${ChatGateway.name}: ${this.handleCreateRoom.name}: Member without owner`,
      );
    }
    const ownerDuplexFriendSet = new Set<string>(
      (await this.chatService.getDuplexFriends(ownerAccountId)).map(
        (e) => e.friendAccountId,
      ),
    );
    const memberAccountIdList = targetAccountIdList.filter((e) =>
      ownerDuplexFriendSet.has(e),
    );

    const result = await this.chatService.createNewRoom(
      {
        title,
        ...modeFlags,
        password,
        limit,
      },
      memberAccountIdList.map((e) => ({
        accountId: e,
        role: e === ownerAccountId ? Role.ADMINISTRATOR : Role.USER,
      })),
    );

    let chatId: string = NULL_UUID;
    if (result.errno === RoomErrorNumber.SUCCESS) {
      const { room } = result;
      chatId = room.id;
      const messages = await this.chatService.loadMessagesAfter(
        chatId,
        undefined,
      );
      void this.server.multicastToRoom(
        chatId,
        builder.makeInsertRoom(room, messages),
      );
    }

    return builder.makeCreateRoomResult(result.errno, chatId);
  }

  @SubscribeMessage(ChatServerOpcode.ENTER_ROOM)
  async handleEnterRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const chatId = payload.readUUID();
    const password = payload.readString();

    const result = await this.chatService.insertChatMember(
      chatId,
      client.accountId,
      password,
      RoleNumber.USER,
    );
    if (result.errno === RoomErrorNumber.SUCCESS) {
      //NOTE: 공통 (InsertMember)
      const { room, member } = result;
      const messages = await this.chatService.loadMessagesAfter(
        room.id,
        undefined,
      );
      void this.server.unicast(
        member.accountId,
        builder.makeInsertRoom(room, messages),
      );
      void this.server.multicastToRoom(
        room.id,
        builder.makeInsertRoomMember(room.id, member),
        member.accountId,
      );

      {
        //FIXME: Temporary: 입장 메시지
        //NOTE: 공통 (SendChatMessage)
        const message = await this.chatService.createNewChatMessage(
          room.id,
          client.accountId,
          `${client.accountId}님이 입장했습니다.`, //FIXME: SearchParams
          MessageTypeNumber.NOTICE,
        );
        void this.server.multicastToRoom(
          room.id,
          builder.makeChatMessagePayload(message),
        );
      }
    }

    return builder.makeEnterRoomResult(result.errno, chatId);
  }

  @SubscribeMessage(ChatServerOpcode.LEAVE_ROOM)
  async handleLeaveRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const chatId = payload.readUUID();
    const result = await this.chatService.deleteChatMember(
      chatId,
      client.accountId,
    );
    if (result.errno !== RoomErrorNumber.SUCCESS) {
      void this.server.unicast(
        client.accountId,
        builder.makeRemoveRoom(chatId),
      );
      void this.server.multicastToRoom(
        chatId,
        builder.makeRemoveRoomMember(chatId, client.accountId),
      );

      {
        //FIXME: Temporary: 퇴장 메시지
        //NOTE: 공통 (SendChatMessage)
        const message = await this.chatService.createNewChatMessage(
          chatId,
          client.accountId,
          `${client.accountId}님이 퇴장했습니다.`, //FIXME: SearchParams
          MessageTypeNumber.NOTICE,
        );
        void this.server.multicastToRoom(
          chatId,
          builder.makeChatMessagePayload(message),
        );
      }
    }

    return builder.makeLeaveRoomResult(result.errno, chatId);
  }

  @SubscribeMessage(ChatServerOpcode.INVITE_USER)
  async handleInviteUser(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const chatId: string = payload.readUUID();
    const targetAccountId: string = payload.readUUID();

    const result = await this.chatService.insertChatMember(
      chatId,
      targetAccountId,
      null,
      RoleNumber.USER,
    );
    if (result.errno === RoomErrorNumber.SUCCESS) {
      //NOTE: 공통 (InsertMember)
      const { room, member } = result;
      const messages = await this.chatService.loadMessagesAfter(
        room.id,
        undefined,
      );
      void this.server.unicast(
        member.accountId,
        builder.makeInsertRoom(room, messages),
      );
      void this.server.multicastToRoom(
        room.id,
        builder.makeInsertRoomMember(room.id, member),
        member.accountId,
      );

      {
        //FIXME: Temporary: 초대 메시지
        //NOTE: 공통 (SendChatMessage)
        const message = await this.chatService.createNewChatMessage(
          room.id,
          client.accountId,
          `${targetAccountId}님을 초대했습니다.`, //FIXME: SearchParams
          MessageTypeNumber.NOTICE,
        );
        void this.server.multicastToRoom(
          room.id,
          builder.makeChatMessagePayload(message),
        );
      }
    }

    return builder.makeInviteRoomResult(result.errno, chatId, targetAccountId);
  }

  @SubscribeMessage(ChatServerOpcode.CHAT_MESSAGE)
  async handleChatMessage(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const chatId = payload.readUUID();
    const content = payload.readString();

    //FIXME: 없는 방, 채팅금지 상태
    //FIXME: 내용이 malicious
    const message = await this.chatService.createNewChatMessage(
      chatId,
      client.accountId,
      content,
      MessageTypeNumber.REGULAR,
    );
    this.server.multicastToRoom(
      chatId,
      builder.makeChatMessagePayload(message),
    );
  }

  @SubscribeMessage(ChatServerOpcode.SYNC_CURSOR)
  async handleSyncCursor(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const chatId = payload.readUUID();
    const lastMessageId = payload.readUUID();

    await this.chatService.updateLastMessageCursor(
      client.accountId,
      chatId,
      lastMessageId,
    );
    this.server.unicast(
      client.accountId,
      builder.makeSyncCursorPayload(lastMessageId),
      client,
    );
  }

  @SubscribeMessage(ChatServerOpcode.MUTE_MEMBER)
  async handleMuteMember(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const chatId = payload.readUUID();
    void chatId; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.KICK_MEMBER)
  async handleKickMember(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.handshakeState, "Invalid state");

    const chatId = payload.readUUID();
    void chatId; //FIXME: service
  }
}

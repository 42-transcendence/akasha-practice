import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { ByteBuffer, assert } from "akasha-lib";
import { ServerOptions } from "ws";
import { ServiceGatewayBase } from "@/service/service-gateway";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { ChatService } from "./chat.service";
import { ChatWebSocket } from "./chat-websocket";
import { ChatServerOpcode } from "@common/chat-opcodes";
import {
  ChatRoomChatMessagePairEntry,
  FriendErrorNumber,
  RoomErrorNumber,
  fromChatRoomModeFlags,
  readChatRoomChatMessagePair,
} from "@common/chat-payloads";
import { AuthLevel } from "@common/auth-payloads";
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
    assert(client.auth.auth_level === AuthLevel.COMPLETED);
    this.assertClient(client.accountId === undefined, "Duplicate handshake");

    client.accountId = client.auth.user_id;
    await this.server.trackClient(client);

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
    this.assertClient(client.accountId !== undefined, "Invalid state");

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
        1, //FIXME: flags를 enum으로
      );
    }
  }

  @SubscribeMessage(ChatServerOpcode.IDLE_AUTO)
  async handleIdleAuto(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

    const idle = payload.readBoolean();
    client.socketActiveStatus = idle
      ? ActiveStatusNumber.IDLE
      : ActiveStatusNumber.ONLINE;
    this.server.multicastToFriend(
      client.accountId,
      builder.makeUpdateFriendActiveStatus(client.accountId),
      1, //FIXME: flags를 enum으로
    );
  }

  @SubscribeMessage(ChatServerOpcode.ADD_FRIEND)
  async handleAddFriend(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

    const targetAccountId = payload.readUUID();
    const groupName = payload.readString();
    const activeFlags = payload.read1();

    if (targetAccountId === client.accountId) {
      return builder.makeAddFriendFailedResult(
        FriendErrorNumber.ERROR_SELF_FRIEND,
      );
    }
    const entry = await this.chatService.addFriend(
      client.accountId,
      targetAccountId,
      groupName,
      activeFlags,
    );
    if (entry === null) {
      return builder.makeAddFriendFailedResult(
        FriendErrorNumber.ERROR_ALREADY_FRIEND,
      );
    }
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
      builder.makeAddFriendSuccessResult(entry),
    );

    return undefined;
  }

  @SubscribeMessage(ChatServerOpcode.MODIFY_FRIEND)
  async handleModifyFriend(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

    const targetAccountId = payload.readUUID();
    //FIXME: flags를 enum으로
    const modifyFlags = payload.read1();
    let groupName: string | undefined;
    if ((modifyFlags & 1) !== 0) {
      groupName = payload.readString();
    }
    let activeFlags: number | undefined;
    if ((modifyFlags & 2) !== 0) {
      activeFlags = payload.read1();
    }

    const entry = await this.chatService.modifyFriend(
      client.accountId,
      targetAccountId,
      groupName,
      activeFlags,
    );

    if (entry === null) {
      return builder.makeModifyFriendFailedResult(
        FriendErrorNumber.ERROR_NOT_FRIEND,
      );
    }
    void this.server.unicast(
      targetAccountId,
      builder.makeUpdateFriendActiveStatus(client.accountId),
    );
    void this.server.unicast(
      client.accountId,
      builder.makeModifyFriendSuccessResult(targetAccountId, entry),
    );

    return undefined;
  }

  @SubscribeMessage(ChatServerOpcode.DELETE_FRIEND)
  async handleDeleteFriend(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

    const targetAccountId = payload.readUUID();

    const success = await this.chatService.deleteFriend(
      client.accountId,
      targetAccountId,
    );
    void success;

    void this.server.unicast(
      targetAccountId,
      builder.makeDeleteFriendSuccessResult(client.accountId),
    );
    void this.server.unicast(
      client.accountId,
      builder.makeDeleteFriendSuccessResult(targetAccountId),
    );

    return undefined;
  }

  @SubscribeMessage(ChatServerOpcode.ADD_ENEMY)
  async handleAddEnemy(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

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
    this.assertClient(client.accountId !== undefined, "Invalid state");

    const targetAccountId = payload.readUUID();
    void targetAccountId; //FIXME: service
    const memo = payload.readString();
    void memo; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.DELETE_ENEMY)
  async handleDeleteEnemy(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

    const targetAccountId = payload.readUUID();
    void targetAccountId; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.PUBLIC_ROOM_LIST_REQUEST)
  async handlePublicRoomListRequest(client: ChatWebSocket) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

    const chatRoomViewList = await this.chatService.loadPublicRoomList();

    return builder.makePublicRoomList(chatRoomViewList);
  }

  @SubscribeMessage(ChatServerOpcode.CREATE_ROOM)
  async handleCreateRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

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

    const room = await this.chatService.createNewRoom({
      title,
      ...modeFlags,
      password,
      limit,
      members: memberAccountIdList.map((e) => ({
        accountId: e,
        role: e === ownerAccountId ? Role.ADMINISTRATOR : Role.USER,
      })),
    });
    //FIXME: try-catch해서 RoomErrorNumber 설정하기? 아니 Transaction 사용하기
    const chatId = room.id;
    const messages = await this.chatService.loadMessagesAfter(
      chatId,
      undefined,
    );

    void this.server.multicastToRoom(
      chatId,
      builder.makeInsertRoom(room, messages),
    );

    return builder.makeCreateRoomResult(RoomErrorNumber.SUCCESS, chatId);
  }

  @SubscribeMessage(ChatServerOpcode.ENTER_ROOM)
  async handleEnterRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

    const chatId = payload.readUUID();
    const password = payload.readString();

    //FIXME: 존재하지 않는 채팅방 혹은 이미 입장한 채팅방
    //FIXME: password 검사
    void password;
    //FIXME: 이미 꽉 찬 채팅방
    //TODO: 이 모든것의 판별이 서비스에서 트랜잭션으로 제공되어야 하는가?
    const member = await this.chatService.insertChatMember(
      chatId,
      client.accountId,
      RoleNumber.USER,
    );
    //FIXME: 실패한 이유
    let errno = RoomErrorNumber.SUCCESS;
    if (member !== null) {
      //NOTE: 공통 (InsertMember)
      const messages = await this.chatService.loadMessagesAfter(
        chatId,
        undefined,
      );
      void this.server.unicast(
        member.accountId,
        builder.makeInsertRoom(member.chat, messages),
      );
      void this.server.multicastToRoom(
        chatId,
        builder.makeInsertRoomMember(chatId, member),
        member.accountId,
      );

      {
        //FIXME: Temporary: 입장 메시지
        //NOTE: 공통 (SendChatMessage)
        const message = await this.chatService.createNewChatMessage(
          chatId,
          client.accountId,
          `${client.accountId}님이 입장했습니다.`, //FIXME: SearchParams
          MessageTypeNumber.NOTICE,
        );
        void this.server.multicastToRoom(
          chatId,
          builder.makeChatMessagePayload(message),
        );
      }
    } else {
      errno = RoomErrorNumber.ERROR_ALREADY_MEMBER;
    }

    return builder.makeEnterRoomResult(errno, chatId);
  }

  @SubscribeMessage(ChatServerOpcode.LEAVE_ROOM)
  async handleLeaveRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

    const chatId = payload.readUUID();
    //FIXME: 입장하지 않은 채팅방
    //FIXME: 방장은 나갈 수 없게 혹은 자동으로 양도
    //TODO: 이 모든것의 판별이 서비스에서 트랜잭션으로 제공되어야 하는가?
    const success = await this.chatService.deleteChatMember(
      chatId,
      client.accountId,
    );
    //FIXME: 실패한 이유
    let errno = RoomErrorNumber.SUCCESS;
    if (success) {
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
    } else {
      errno = RoomErrorNumber.ERROR_NOT_MEMBER;
    }

    return builder.makeLeaveRoomResult(errno, chatId);
  }

  @SubscribeMessage(ChatServerOpcode.INVITE_USER)
  async handleInviteUser(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

    const chatId: string = payload.readUUID();
    const targetAccountId: string = payload.readUUID();

    //FIXME: 없는 상대 혹은 상대가 차단하여 초대할 수 없음
    //FIXME: 존재하지 않는 채팅방 혹은 이미 입장한 채팅방
    //FIXME: 이미 꽉 찬 채팅방
    //TODO: 이 모든것의 판별이 서비스에서 트랜잭션으로 제공되어야 하는가?
    const member = await this.chatService.insertChatMember(
      chatId,
      targetAccountId,
      RoleNumber.USER,
    );
    //FIXME: 실패한 이유
    let errno = RoomErrorNumber.SUCCESS;
    if (member !== null) {
      //NOTE: 공통 (InsertMember)
      const messages = await this.chatService.loadMessagesAfter(
        chatId,
        undefined,
      );
      void this.server.unicast(
        member.accountId,
        builder.makeInsertRoom(member.chat, messages),
      );
      void this.server.multicastToRoom(
        chatId,
        builder.makeInsertRoomMember(chatId, member),
        member.accountId,
      );

      {
        //FIXME: Temporary: 초대 메시지
        //NOTE: 공통 (SendChatMessage)
        const message = await this.chatService.createNewChatMessage(
          chatId,
          client.accountId,
          `${targetAccountId}님을 초대했습니다.`, //FIXME: SearchParams
          MessageTypeNumber.NOTICE,
        );
        void this.server.multicastToRoom(
          chatId,
          builder.makeChatMessagePayload(message),
        );
      }
    } else {
      errno = RoomErrorNumber.ERROR_ALREADY_MEMBER;
    }

    return builder.makeInviteRoomResult(errno, chatId, targetAccountId);
  }

  @SubscribeMessage(ChatServerOpcode.CHAT_MESSAGE)
  async handleChatMessage(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

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
    this.assertClient(client.accountId !== undefined, "Invalid state");

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
    this.assertClient(client.accountId !== undefined, "Invalid state");

    const chatId = payload.readUUID();
    void chatId; //FIXME: service
  }

  @SubscribeMessage(ChatServerOpcode.KICK_MEMBER)
  async handleKickMember(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.accountId !== undefined, "Invalid state");

    const chatId = payload.readUUID();
    void chatId; //FIXME: service
  }
}

import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { ByteBuffer, assert } from "akasha-lib";
import { ServerOptions } from "ws";
import { ServiceGatewayBase } from "@/service/service-gateway";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { ChatService } from "./chat.service";
import { ChatWebSocket } from "./chat-websocket";
import { ChatServerOpcode } from "@common/chat-opcodes";
import {
  ChatMemberModeFlags,
  ChatRoomChatMessagePairEntry,
  ChatRoomModeFlags,
  FriendErrorNumber,
  RoomErrorNumber,
  readChatRoomChatMessagePair,
} from "@common/chat-payloads";
import { AuthLevel } from "@common/auth-payloads";
import { PacketHackException } from "@/service/packet-hack-exception";
import {
  CHAT_ROOM_TITLE_REGEX,
  MAX_CHAT_MEMBER_CAPACITY,
} from "@common/chat-constants";
import { Prisma } from "@prisma/client";
import * as builder from "./chat-payload-builder";
import { ChatServer } from "./chat.server";
import { ActiveStatusNumber } from "@common/generated/types";

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
    this.assertClient(client.account === undefined, "Duplicate handshake");

    const uuid = client.auth.user_id;
    const id = await this.chatService.getAccountId(uuid);
    this.assertClient(id !== null, "Deleted account");

    client.account = { uuid, id };
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
    this.assertClient(client.account !== undefined, "Invalid state");

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
      client.account.uuid,
    );
    if (prevActiveStatus !== activeStatus) {
      this.chatService.setActiveStatus(client.account.uuid, activeStatus);
      if (
        (prevActiveStatus === ActiveStatusNumber.INVISIBLE) !==
        (activeStatus === ActiveStatusNumber.INVISIBLE)
      ) {
        this.chatService.setActiveTimestamp(client.account.uuid, true);
      }
      this.server.multicastToFriend(
        client.account.uuid,
        builder.makeUpdateFriendActiveStatus(client.account.uuid),
        1, //FIXME: flags를 enum으로
      );
    }
  }

  @SubscribeMessage(ChatServerOpcode.IDLE_AUTO)
  async handleIdleAuto(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const idle = payload.readBoolean();
    client.socketActiveStatus = idle
      ? ActiveStatusNumber.IDLE
      : ActiveStatusNumber.ONLINE;
    this.server.multicastToFriend(
      client.account.uuid,
      builder.makeUpdateFriendActiveStatus(client.account.uuid),
      1, //FIXME: flags를 enum으로
    );
  }

  @SubscribeMessage(ChatServerOpcode.ADD_FRIEND)
  async handleAddFriend(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const targetUUID = payload.readUUID();
    const groupName = payload.readString();
    const activeFlags = payload.read1();

    if (targetUUID === client.account.uuid) {
      return builder.makeAddFriendFailedResult(
        FriendErrorNumber.ERROR_SELF_FRIEND,
      );
    }
    const entry = await this.chatService.addFriend(
      client.account.id,
      targetUUID,
      groupName,
      activeFlags,
    );
    if (entry === null) {
      return builder.makeAddFriendFailedResult(
        FriendErrorNumber.ERROR_ALREADY_FRIEND,
      );
    }
    if (
      await this.chatService.isDuplexFriendByUUID(client.account.id, targetUUID)
    ) {
      void this.server.unicastByAccountUUID(
        targetUUID,
        builder.makeUpdateFriendActiveStatus(client.account.uuid),
      );
    } else {
      void this.server.unicastByAccountUUID(
        targetUUID,
        builder.makeFriendRequest(client.account.uuid),
      );
    }
    void this.server.unicast(
      client.account.id,
      builder.makeAddFriendSuccessResult(entry),
    );

    return undefined;
  }

  @SubscribeMessage(ChatServerOpcode.MODIFY_FRIEND)
  async handleModifyFriend(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const targetUUID = payload.readUUID();
    //FIXME: flags를 enum으로
    const modifyFlags = payload.read1();
    const mutate: Prisma.FriendUpdateManyMutationInput = {};
    if ((modifyFlags & 1) !== 0) {
      const groupName = payload.readString();
      mutate.groupName = groupName;
    }
    if ((modifyFlags & 2) !== 0) {
      const activeFlags = payload.read1();
      mutate.activeFlags = activeFlags;
    }

    const entry = await this.chatService.modifyFriend(
      client.account.id,
      targetUUID,
      mutate,
    );

    if (entry === null) {
      return builder.makeModifyFriendFailedResult(
        FriendErrorNumber.ERROR_NOT_FRIEND,
      );
    }
    void this.server.unicastByAccountUUID(
      targetUUID,
      builder.makeUpdateFriendActiveStatus(client.account.uuid),
    );
    void this.server.unicast(
      client.account.id,
      builder.makeModifyFriendSuccessResult(targetUUID, entry),
    );

    return undefined;
  }

  @SubscribeMessage(ChatServerOpcode.DELETE_FRIEND)
  async handleDeleteFriend(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const targetUUID = payload.readUUID();

    const success = await this.chatService.deleteFriend(
      client.account.id,
      targetUUID,
    );
    void success;

    void this.server.unicastByAccountUUID(
      targetUUID,
      builder.makeDeleteFriendSuccessResult(client.account.uuid),
    );
    void this.server.unicast(
      client.account.id,
      builder.makeDeleteFriendSuccessResult(targetUUID),
    );

    return undefined;
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

    return builder.makePublicRoomList(chatRoomViewList);
  }

  @SubscribeMessage(ChatServerOpcode.CREATE_ROOM)
  async handleCreateRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const title = payload.readString();
    if (!CHAT_ROOM_TITLE_REGEX.test(title)) {
      throw new PacketHackException(
        `${ChatGateway.name}: ${this.handleCreateRoom.name}: Illegal title [${title}]`,
      );
    }
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
    if (limit == 0 || limit > MAX_CHAT_MEMBER_CAPACITY) {
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
      modeFlags:
        e === ownerUUID
          ? ChatMemberModeFlags.ADMIN | ChatMemberModeFlags.MANAGER
          : 0,
    }));
    //FIXME: 쌍방향 친구만 필터링하기

    const room = await this.chatService.createNewRoom({
      title,
      modeFlags,
      password,
      limit,
      members,
    });
    //FIXME: try-catch해서 RoomErrorNumber 설정하기?
    const roomUUID = room.uuid;
    const messages = await this.chatService.loadMessagesAfter(
      roomUUID,
      undefined,
    );

    void this.server.multicastToRoom(
      roomUUID,
      builder.makeInsertRoom(room, messages),
    );

    return builder.makeCreateRoomResult(RoomErrorNumber.SUCCESS, roomUUID);
  }

  @SubscribeMessage(ChatServerOpcode.ENTER_ROOM)
  async handleEnterRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const roomUUID = payload.readUUID();
    const password = payload.readString();

    //FIXME: 존재하지 않는 채팅방 혹은 이미 입장한 채팅방
    //FIXME: password 검사
    void password;
    //FIXME: 이미 꽉 찬 채팅방
    //TODO: 이 모든것의 판별이 서비스에서 트랜잭션으로 제공되어야 하는가?
    const member = await this.chatService.insertChatMember(
      roomUUID,
      client.account.id,
    );
    //FIXME: 실패한 이유
    let errno = RoomErrorNumber.SUCCESS;
    if (member !== null) {
      //NOTE: 공통 (InsertMember)
      const messages = await this.chatService.loadMessagesAfter(
        roomUUID,
        undefined,
      );
      void this.server.unicast(
        member.accountId,
        builder.makeInsertRoom(member.chat, messages),
      );
      void this.server.multicastToRoom(
        roomUUID,
        builder.makeInsertRoomMember(roomUUID, member),
        member.accountId,
      );

      {
        //FIXME: Temporary: 입장 메시지
        //NOTE: 공통 (SendChatMessage)
        const message = await this.chatService.createNewChatMessage(
          roomUUID,
          client.account.id,
          `${client.account.uuid}님이 입장했습니다.`,
          1, //FIXME: 입장 메시지 타입
        );
        void this.server.multicastToRoom(
          roomUUID,
          builder.makeChatMessagePayload(message),
        );
      }
    } else {
      errno = RoomErrorNumber.ERROR_ALREADY_MEMBER;
    }

    return builder.makeEnterRoomResult(errno, roomUUID);
  }

  @SubscribeMessage(ChatServerOpcode.LEAVE_ROOM)
  async handleLeaveRoom(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const roomUUID = payload.readUUID();
    //FIXME: 입장하지 않은 채팅방
    //FIXME: 방장은 나갈 수 없게 혹은 자동으로 양도
    //TODO: 이 모든것의 판별이 서비스에서 트랜잭션으로 제공되어야 하는가?
    const success = await this.chatService.deleteChatMember(
      roomUUID,
      client.account.id,
    );
    //FIXME: 실패한 이유
    let errno = RoomErrorNumber.SUCCESS;
    if (success) {
      void this.server.unicast(
        client.account.id,
        builder.makeRemoveRoom(roomUUID),
      );
      void this.server.multicastToRoom(
        roomUUID,
        builder.makeRemoveRoomMember(roomUUID, client.account.uuid),
      );

      {
        //FIXME: Temporary: 퇴장 메시지
        //NOTE: 공통 (SendChatMessage)
        const message = await this.chatService.createNewChatMessage(
          roomUUID,
          client.account.id,
          `${client.account.uuid}님이 퇴장했습니다.`,
          2, //FIXME: 퇴장 메시지 타입
        );
        void this.server.multicastToRoom(
          roomUUID,
          builder.makeChatMessagePayload(message),
        );
      }
    } else {
      errno = RoomErrorNumber.ERROR_NOT_MEMBER;
    }

    return builder.makeLeaveRoomResult(errno, roomUUID);
  }

  @SubscribeMessage(ChatServerOpcode.INVITE_USER)
  async handleInviteUser(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const roomUUID: string = payload.readUUID();
    const targetUUID: string = payload.readUUID();

    //FIXME: 없는 상대 혹은 상대가 차단하여 초대할 수 없음
    //FIXME: 존재하지 않는 채팅방 혹은 이미 입장한 채팅방
    //FIXME: 이미 꽉 찬 채팅방
    //TODO: 이 모든것의 판별이 서비스에서 트랜잭션으로 제공되어야 하는가?
    const member = await this.chatService.insertChatMemberByUUID(
      roomUUID,
      targetUUID,
    );
    //FIXME: 실패한 이유
    let errno = RoomErrorNumber.SUCCESS;
    if (member !== null) {
      //NOTE: 공통 (InsertMember)
      const messages = await this.chatService.loadMessagesAfter(
        roomUUID,
        undefined,
      );
      void this.server.unicast(
        member.accountId,
        builder.makeInsertRoom(member.chat, messages),
      );
      void this.server.multicastToRoom(
        roomUUID,
        builder.makeInsertRoomMember(roomUUID, member),
        member.accountId,
      );

      {
        //FIXME: Temporary: 초대 메시지
        //NOTE: 공통 (SendChatMessage)
        const message = await this.chatService.createNewChatMessage(
          roomUUID,
          client.account.id,
          `${targetUUID}님을 초대했습니다.`,
          4, //FIXME: 초대 메시지 타입
        );
        void this.server.multicastToRoom(
          roomUUID,
          builder.makeChatMessagePayload(message),
        );
      }
    } else {
      errno = RoomErrorNumber.ERROR_ALREADY_MEMBER;
    }

    return builder.makeInviteRoomResult(errno, roomUUID, targetUUID);
  }

  @SubscribeMessage(ChatServerOpcode.CHAT_MESSAGE)
  async handleChatMessage(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const roomUUID = payload.readUUID();
    const content = payload.readString();

    //FIXME: 없는 방, 채팅금지 상태
    //FIXME: 내용이 malicious
    const message = await this.chatService.createNewChatMessage(
      roomUUID,
      client.account.id,
      content,
    );
    this.server.multicastToRoom(
      roomUUID,
      builder.makeChatMessagePayload(message),
    );
  }

  @SubscribeMessage(ChatServerOpcode.SYNC_CURSOR)
  async handleSyncCursor(client: ChatWebSocket, payload: ByteBuffer) {
    this.assertClient(client.account !== undefined, "Invalid state");

    const lastMessageId = payload.readUUID();

    const success: boolean = await this.chatService.updateLastMessageCursor(
      client.account.id,
      lastMessageId,
    );
    void success;
    this.server.unicast(
      client.account.id,
      builder.makeSyncCursorPayload(lastMessageId),
      client,
    );
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

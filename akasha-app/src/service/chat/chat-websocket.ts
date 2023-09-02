import { assert } from "akasha-lib";
import { ServiceWebSocketBase } from "@/service/service-socket";
import { ChatService } from "./chat.service";
import {
  ChatMessageEntry,
  ChatRoomChatMessagePairEntry,
  ChatRoomEntry,
  SocialPayload,
} from "@common/chat-payloads";
import { ChatServer } from "./chat.server";
import { ActiveStatusNumber } from "@common/generated/types";

type AccountLink = {
  uuid: string;
  id: number;
};

export class ChatWebSocket extends ServiceWebSocketBase {
  private _backing_server: ChatServer | undefined = undefined;
  protected get server(): ChatServer {
    return assert(this._backing_server !== undefined), this._backing_server;
  }

  private _backing_chatService: ChatService | undefined = undefined;
  protected get chatService(): ChatService {
    return (
      assert(this._backing_chatService !== undefined), this._backing_chatService
    );
  }

  injectProviders(server: ChatServer, chatService: ChatService): void {
    assert(
      this._backing_server === undefined &&
        this._backing_chatService === undefined,
    );
    this._backing_server = server;
    this._backing_chatService = chatService;
  }

  account: AccountLink | undefined = undefined;

  socketActiveStatus = ActiveStatusNumber.ONLINE;

  async onFirstConnection() {
    assert(this.account !== undefined);

    this.chatService.setActiveTimestamp(this.account.uuid, false);
  }

  async onLastDisconnect() {
    assert(this.account !== undefined);

    this.chatService.setActiveTimestamp(this.account.uuid, false);
  }

  async initialize(fetchedMessageIdPairs: ChatRoomChatMessagePairEntry[]) {
    assert(this.account !== undefined);

    const id = this.account.id;

    const chatRoomList: ChatRoomEntry[] =
      await this.chatService.loadOwnRoomListByAccountId(id);
    const fetchedMessageIdMap = fetchedMessageIdPairs.reduce(
      (map, e) => map.set(e.uuid, e.messageUUID),
      new Map<string, string>(),
    );
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
    return { chatRoomList, chatMessageMap, socialPayload };
  }
}

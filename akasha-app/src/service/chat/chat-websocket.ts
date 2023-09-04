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

  accountId: string | undefined = undefined;

  socketActiveStatus = ActiveStatusNumber.ONLINE;

  async onFirstConnection() {
    assert(this.accountId !== undefined);

    this.chatService.setActiveTimestamp(this.accountId, false);
  }

  async onLastDisconnect() {
    assert(this.accountId !== undefined);

    this.chatService.setActiveTimestamp(this.accountId, false);
  }

  async initialize(fetchedMessageIdPairs: ChatRoomChatMessagePairEntry[]) {
    assert(this.accountId !== undefined);

    const chatRoomList: ChatRoomEntry[] =
      await this.chatService.loadOwnRoomList(this.accountId);
    const fetchedMessageIdMap = fetchedMessageIdPairs.reduce(
      (map, e) => map.set(e.chatId, e.messageId),
      new Map<string, string>(),
    );
    const chatMessageMap = new Map<string, ChatMessageEntry[]>();
    for (const chatRoom of chatRoomList) {
      const chatId = chatRoom.id;
      chatMessageMap.set(
        chatId,
        await this.chatService.loadMessagesAfter(
          chatId,
          fetchedMessageIdMap.get(chatId),
        ),
      );
    }
    const socialPayload: SocialPayload = await this.chatService.loadSocial(
      this.accountId,
    );
    return { chatRoomList, chatMessageMap, socialPayload };
  }
}

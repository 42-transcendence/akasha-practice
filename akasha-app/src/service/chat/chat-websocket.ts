import { assert } from "akasha-lib";
import { ServiceWebSocketBase } from "@/service/service-socket";
import { ChatService } from "./chat.service";
import {
  ChatMessageEntry,
  ChatRoomChatMessagePairEntry,
  ChatRoomEntry,
  SocialPayload,
} from "@common/chat-payloads";

type AccountLink = {
  uuid: string;
  id: number;
};

export class ChatWebSocket extends ServiceWebSocketBase {
  private _backing_chatService: ChatService | undefined = undefined;
  protected get chatService(): ChatService {
    assert(this._backing_chatService !== undefined);

    return this._backing_chatService;
  }
  private set chatService(value: ChatService) {
    assert(this._backing_chatService === undefined);

    this._backing_chatService = value;
  }

  injectChatService(chatService: ChatService): void {
    this.chatService = chatService;
  }

  account: AccountLink | undefined = undefined;

  onFirstConnection() {}

  onLastDisconnect() {}

  async initialize(fetchedMessageIdPairs: ChatRoomChatMessagePairEntry[]) {
    const id = this.account!.id;

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

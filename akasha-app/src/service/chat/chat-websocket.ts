import { assert } from "akasha-lib";
import { ServiceWebSocketBase } from "@/service/service-socket";
import { ChatService } from "./chat.service";

type ChatWebSocketRecord = {
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

  record: ChatWebSocketRecord | undefined = undefined;
}

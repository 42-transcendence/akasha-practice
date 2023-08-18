import { assert } from "akasha-lib";
import { ServiceWebSocketBase } from "@/service/service-socket";
import { ChatService } from "./chat.service";
import { AuthLevel } from "@/user/auth/auth-payload";
import { AccountWithRecord } from "@/user/accounts/accounts.service";

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

  record: AccountWithRecord | undefined = undefined;

  async initialize(): Promise<void> {
    assert(this.auth.auth_level === AuthLevel.COMPLETED);

    this.record = await this.chatService.loadInitializeData(this.auth.user_id);
  }
}

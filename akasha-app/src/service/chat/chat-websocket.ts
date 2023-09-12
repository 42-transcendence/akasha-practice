import { assert } from "akasha-lib";
import { ServiceWebSocketBase } from "@/service/service-socket";
import { ChatService } from "./chat.service";
import { ChatServer } from "./chat.server";
import { ActiveStatusNumber } from "@common/generated/types";
import { AuthLevel } from "@common/auth-payloads";
import * as builder from "./chat-payload-builder";
import { FriendActiveFlags } from "@common/chat-payloads";

export class ChatWebSocket extends ServiceWebSocketBase {
  private _backing_accountId: string | undefined;
  get accountId(): string {
    return (
      assert(this._backing_accountId !== undefined), this._backing_accountId
    );
  }

  private _backing_server: ChatServer | undefined;
  protected get server(): ChatServer {
    return assert(this._backing_server !== undefined), this._backing_server;
  }

  private _backing_chatService: ChatService | undefined;
  protected get chatService(): ChatService {
    return (
      assert(this._backing_chatService !== undefined), this._backing_chatService
    );
  }

  injectProviders(server: ChatServer, chatService: ChatService): void {
    assert(this.auth.auth_level === AuthLevel.COMPLETED);
    assert(
      this._backing_server === undefined &&
        this._backing_chatService === undefined,
    );

    this._backing_accountId = this.auth.user_id;
    this._backing_server = server;
    this._backing_chatService = chatService;

    this.auth = undefined;
  }

  handshakeState = false;
  socketActiveStatus = ActiveStatusNumber.ONLINE;

  async onFirstConnection() {
    //NOTE: OFFLINE -> ONLINE
    this.chatService.setActiveTimestampExceptInvisible(this.accountId);
    this.notifyActiveStatus();
  }

  async onLastDisconnect() {
    //NOTE: ONLINE -> OFFLINE
    this.chatService.setActiveTimestampExceptInvisible(this.accountId);
    this.notifyActiveStatus();
  }

  notifyActiveStatus() {
    void this.server.multicastToFriend(
      this.accountId,
      builder.makeUpdateFriendActiveStatus(this.accountId),
      FriendActiveFlags.SHOW_ACTIVE_STATUS,
    );
  }
}

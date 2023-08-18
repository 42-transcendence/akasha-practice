import { ServiceWebSocketBase } from "@/service/service-socket";
import { Logger } from "@nestjs/common";

export class ChatWebSocket extends ServiceWebSocketBase {
  override onServiceConnection(): void {
    Logger.debug(
      `Connection ChatWebSocket[${this.remoteAddress} -> ${this.remoteURL}]`,
    );
  }

  override onServiceDisconnection(): void {
    Logger.debug(
      `Disconnect ChatWebSocket[${this.remoteAddress} -> ${this.remoteURL}]`,
    );
  }
}

import { ServiceWebSocketBase } from "@/service/service-socket";
import { Logger } from "@nestjs/common";

export class GameWebSocket extends ServiceWebSocketBase {
  override onServiceConnection(): void {
    Logger.debug(
      `Connection GameWebSocket[${this.remoteAddress} -> ${this.remoteURL}]`,
    );
  }

  override onServiceDisconnection(): void {
    Logger.debug(
      `Disconnect GameWebSocket[${this.remoteAddress} -> ${this.remoteURL}]`,
    );
  }
}

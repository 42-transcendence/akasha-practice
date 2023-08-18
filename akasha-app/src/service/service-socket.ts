import { IncomingMessage } from "http";
import { WebSocket } from "ws";
import { assert } from "akasha-lib";
import { AuthPayload } from "@/user/auth/auth-payload";
import { AuthGuard } from "@/user/auth/auth.guard";
import { Logger } from "@nestjs/common";

const pingDelayInMillis = 30 * 1000;

export abstract class ServiceWebSocketBase extends WebSocket {
  private isAlive: boolean = true;
  private pingInterval: NodeJS.Timeout | string | number | undefined =
    undefined;

  _backing_auth: AuthPayload | undefined = undefined;
  protected get auth(): AuthPayload {
    assert(this._backing_auth !== undefined);

    return this._backing_auth;
  }
  private set auth(value: AuthPayload) {
    this._backing_auth = value;
  }

  remoteAddress: string;
  remoteURL: string;

  onConnection(req: IncomingMessage): void {
    try {
      this.auth = AuthGuard.extractAuthPayload(req);
      this.on("pong", () => this.onHeartbeat());
      this.pingInterval = setInterval(() => this.sendPing(), pingDelayInMillis);

      this.remoteAddress = req.socket.remoteAddress!;
      this.remoteURL = req.url!;

      this.onServiceConnection();
    } catch (e) {
      //XXX: NestJS가 OnGatewayConnection에서 발생하는 오류를 이벤트 루프에 도달할 때까지 잡지 않음.
      Logger.error(`OnConnection: ${e}`, "UnhandledWebSocketError");
      this.terminate();
    }
  }

  abstract onServiceConnection(): void;

  onDisconnect(): void {
    try {
      clearInterval(this.pingInterval);

      this.onServiceDisconnection();
    } catch (e) {
      //XXX: NestJS가 OnGatewayDisconnect에서 발생하는 오류를 이벤트 루프에 도달할 때까지 잡지 않음.
      Logger.error(`OnDisconnect: ${e}`, "UnhandledWebSocketError");
    }
  }

  abstract onServiceDisconnection(): void;

  private sendPing(): void {
    if (this.isAlive === false) {
      return this.terminate();
    }
    this.isAlive = false;

    this.ping();
  }

  private onHeartbeat(): void {
    this.isAlive = true;
  }
}

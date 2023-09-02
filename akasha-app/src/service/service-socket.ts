import { IncomingMessage } from "http";
import { WebSocket } from "ws";
import { ByteBuffer, assert } from "akasha-lib";
import { AuthPayload } from "@common/auth-payloads";
import { AuthGuard } from "@/user/auth/auth.guard";

const pingDelayInMillis = 30 * 1000;

export abstract class ServiceWebSocketBase extends WebSocket {
  private isAlive: boolean = true;
  private pingInterval: NodeJS.Timeout | string | number | undefined =
    undefined;

  private _backing_auth: AuthPayload | undefined = undefined;
  get auth(): AuthPayload {
    assert(this._backing_auth !== undefined);

    return this._backing_auth;
  }
  protected set auth(value: AuthPayload) {
    this._backing_auth = value;
  }

  remoteAddress: string | undefined;
  remoteURL: string | undefined;

  onConnection(req: IncomingMessage): void {
    this.auth = AuthGuard.extractAuthPayload(req);
    this.on("pong", () => this.onHeartbeat());
    this.pingInterval = setInterval(() => this.sendPing(), pingDelayInMillis);

    this.remoteAddress = req.socket.remoteAddress!;
    this.remoteURL = req.url!;
  }

  onDisconnect(): void {
    clearInterval(this.pingInterval);
  }

  isIllegalException(exception: unknown): boolean {
    void exception;
    return true;
  }

  sendPayload(payload: ByteBuffer): void {
    this.send(payload.toArray(), { binary: true });
  }

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

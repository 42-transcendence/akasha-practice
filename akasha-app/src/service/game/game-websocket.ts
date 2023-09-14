import { assert } from "akasha-lib";
import { ServiceWebSocketBase } from "@/service/service-websocket";
import { GameService } from "./game.service";
import { GameServer } from "./game.server";
import { AuthLevel } from "@common/auth-payloads";

export class GameWebSocket extends ServiceWebSocketBase {
  private _backing_accountId: string | undefined;
  get accountId(): string {
    return (
      assert(this._backing_accountId !== undefined), this._backing_accountId
    );
  }

  private _backing_server: GameServer | undefined;
  protected get server(): GameServer {
    return assert(this._backing_server !== undefined), this._backing_server;
  }

  private _backing_gameService: GameService | undefined;
  protected get gameService(): GameService {
    return (
      assert(this._backing_gameService !== undefined), this._backing_gameService
    );
  }

  injectProviders(server: GameServer, gameService: GameService): void {
    assert(this.auth.auth_level === AuthLevel.COMPLETED);
    assert(
      this._backing_server === undefined &&
        this._backing_gameService === undefined,
    );

    this._backing_accountId = this.auth.user_id;
    this._backing_server = server;
    this._backing_gameService = gameService;

    this.auth = undefined;
  }

  handshakeState = false;
  matchmaking: boolean | undefined;
  enqueued = false; //NOTE: `matchmaking`-only
  gameId: string | undefined;
  closePosted = false;
}

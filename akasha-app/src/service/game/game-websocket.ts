import { assert } from "akasha-lib";
import { ServiceWebSocketBase } from "@/service/service-socket";
import { GameService } from "./game.service";

export class GameWebSocket extends ServiceWebSocketBase {
  _backing_gameService: GameService | undefined = undefined;
  uuid: string = '';
  protected get gameService(): GameService {
    assert(this._backing_gameService !== undefined);

    return this._backing_gameService;
  }
  private set gameService(value: GameService) {
    assert(this._backing_gameService === undefined);

    this._backing_gameService = value;
  }

  injectGameService(gameService: GameService): void {
    this.gameService = gameService;
  }
}

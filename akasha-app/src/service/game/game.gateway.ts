import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { ByteBuffer, assert } from "akasha-lib";
import { ServerOptions, WebSocketServer as Server } from "ws";
import { Logger } from "@nestjs/common";
import { ServiceGatewayBase } from "@/service/service-gateway";
import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { GameService } from "./game.service";
import { GameWebSocket } from "./game-websocket";
import { GameServerOpcode, GameClientOpcode } from "@common/game-opcodes";
import { Frame } from "@/_common/game-payload";
import { AuthLevel } from "@/_common/auth-payloads";
import { readFrame } from "./game-payload-builder";

@WebSocketGateway<ServerOptions>({
  path: "/game",
  verifyClient: verifyClientViaQueryParam("token"),
  WebSocket: GameWebSocket,
})
export class GameGateway extends ServiceGatewayBase<GameWebSocket> {
  @WebSocketServer()
  private readonly server!: Server;
  private worldFrames: Map<string, { fixed: boolean, frame: Frame }[]>;
  //temp
  private gameRoomList: Map<string, string[]>;

  constructor(private readonly gameService: GameService) {
    super();
    void this.server;
    this.worldFrames = new Map<string, { fixed: boolean, frame: Frame }[]>;
    this.gameRoomList = new Map<string, string[]>;
  }

  override handleServiceConnection(client: GameWebSocket): void {
    Logger.debug(
      `Connection GameWebSocket[${client.remoteAddress} -> ${client.remoteURL}]`,
    );

    client.injectGameService(this.gameService);
  }

  override handleServiceDisconnect(client: GameWebSocket): void {
    Logger.debug(
      `Disconnect GameWebSocket[${client.remoteAddress} -> ${client.remoteURL}]`,
    );
  }

  @SubscribeMessage(GameServerOpcode.HANDSHAKE)
  handleHandshake(client: GameWebSocket, _payload: ByteBuffer) {
    assert(client.auth.auth_level === AuthLevel.COMPLETED);

    const uuid = client.auth.user_id;
    client.uuid = uuid;
  }

  @SubscribeMessage(GameServerOpcode.JOIN)
  roomJoin(client: GameWebSocket, payload: ByteBuffer): ByteBuffer {
    const roomName: string = payload.readString();
    const members: string[] | undefined = this.gameRoomList.get(roomName);
    if (members === undefined) {
      this.gameRoomList.set(roomName, [client.uuid])
    }
    else {
      if (members.length > 2) { } // TODO - 두명 넘으면 제껴!
      members.push(client.uuid);
    }
    const buf = ByteBuffer.createWithOpcode(GameClientOpcode.ACCEPT);
    return buf;
  }

  @SubscribeMessage(GameServerOpcode.START)
  gameStrat(client: GameWebSocket, payload: ByteBuffer) {
    const roomName: string = payload.readString();
    const members: string[] | undefined = this.gameRoomList.get(roomName);
    if (members === undefined) {
      return ByteBuffer.createWithOpcode(GameClientOpcode.REJECT);
    }
    const buf = ByteBuffer.createWithOpcode(GameClientOpcode.START);

  }
  @SubscribeMessage(GameServerOpcode.FRAME)
  getFrame(client: GameWebSocket, payload: ByteBuffer) {
    const player: number = payload.read1();
    const roomName: string = payload.readString();
    const frame: Frame = readFrame(payload);
    // const members: string[] | undefined = this.gameRoomList.get(roomName);
    // if (members === undefined) {
    //   return ByteBuffer.createWithOpcode(GameClientOpcode.REJECT);
    // }
    const frames = this.worldFrames.get(roomName);
    if (frames === undefined) {
      this.worldFrames.set(roomName, [{ fixed: false, frame }]);
    }
    else {
      if (frames.length === 0 || frames[frames.length - 1].frame.id < frame.id) {
        frames.push({ fixed: false, frame });
      }
      else {
        this.syncFrame(player, frames, frame);
        let count = 0;
        for (; count < frames.length; count++) {
          if (frames[count].fixed === false) {
            break;
          }
        }
        frames.splice(0, count);
      }
    }
  }
  private syncFrame(player: number, frames: { fixed: boolean, frame: Frame }[], frame: Frame) {
    const velocity = { x: 0, y: 0 };
    const prevPos = { x: 0, y: 0 };
    const ballV = { x: 0, y: 0 };
    const ballPos = { x: 0, y: 0 };
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].frame.id === frame.id) {
        frames[i].fixed == true;
        //프레임 패들 위치 속도 병합
        if (player === 1) {
          frames[i].frame.paddle1 = frame.paddle1;
          velocity.x = frame.paddle1.velocity.x;
          velocity.y = frame.paddle1.velocity.y;
          prevPos.x = frame.paddle1.position.x;
          prevPos.y = frame.paddle1.position.y;
        }
        else {
          frames[i].frame.paddle2 = frame.paddle2;
          velocity.x = frame.paddle2.velocity.x;
          velocity.y = frame.paddle2.velocity.y;
          prevPos.x = frame.paddle2.position.x;
          prevPos.y = frame.paddle2.position.y;
        }
        //프레임 공의 위치 속도 병합
        if (frame.paddle1Hit === true || frame.paddle2Hit === true) {
          frames[i].frame.ball = frame.ball;
        }
        ballV.x = frames[i].frame.ball.velocity.x;
        ballV.y = frames[i].frame.ball.velocity.y;
        ballPos.x = frames[i].frame.ball.position.x;
        ballPos.y = frames[i].frame.ball.position.y;
        //프레임 점수차이
        if (frames[i].frame.player1Score !== frame.player1Score) {

        }
        else if (frames[i].frame.player2Score !== frame.player2Score) {

        }
      }
      else if (i > frame.id) {
        prevPos.x += velocity.x;
        prevPos.y += velocity.y;
        if (player === 1) {
          frames[i].frame.paddle1.position = prevPos;
          frames[i].frame.paddle1.velocity = velocity;
        }
        else {
          frames[i].frame.paddle2.position = prevPos;
          frames[i].frame.paddle2.velocity = velocity;
        }
        ballPos.x += ballV.x;
        ballPos.y += ballV.y;
        frames[i].frame.ball.position = ballPos;
        frames[i].frame.ball.velocity = ballV;
        // 자체 물리엔진 적용!
      }
    }
  }
  private diff(num1: number, num2: number): boolean {
    if (Math.abs(num1 - num2) < 1)
      return true;
    return false;
  }
}

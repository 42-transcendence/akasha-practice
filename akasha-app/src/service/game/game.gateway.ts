import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { ByteBuffer, NULL_UUID, assert } from "akasha-lib";
import { ServerOptions, WebSocketServer as Server } from "ws";
import { Logger } from "@nestjs/common";
import { ServiceGatewayBase } from "@/service/service-gateway";
// import { verifyClientViaQueryParam } from "@/service/ws-verify-client";
import { GameService } from "./game.service";
import { GameWebSocket } from "./game-websocket";
import { GameServerOpcode, GameClientOpcode } from "@common/game-opcodes";
import { Frame, PhysicsAttribute } from "@/_common/game-payload";
import { AuthLevel } from "@/_common/auth-payloads";
import { readFrame, writeFrame, writeFrames } from "./game-payload-builder";
import { copy, getScore, physicsEngine } from "./game-physics-engine";

@WebSocketGateway<ServerOptions>({
  path: "/game",
  // verifyClient: verifyClientViaQueryParam("token"),
  WebSocket: GameWebSocket,
})
export class GameGateway extends ServiceGatewayBase<GameWebSocket> {
  @WebSocketServer()
  private readonly server!: Server;
  private worldFrames: Map<string, { fixed: boolean, frame: Frame }[]>;
  //temp
  private gameRoomList: Map<string, string[]>;
  private clients: Set<GameWebSocket>;

  constructor(private readonly gameService: GameService) {
    super();
    void this.server;
    this.worldFrames = new Map<string, { fixed: boolean, frame: Frame }[]>;
    this.gameRoomList = new Map<string, string[]>;
    this.clients = new Set<GameWebSocket>;
  }

  override handleServiceConnection(client: GameWebSocket): void {
    Logger.debug(
      `Connection GameWebSocket[${client.remoteAddress} -> ${client.remoteURL}]`,
    );

    client.injectGameService(this.gameService);
  }

  override handleServiceDisconnect(client: GameWebSocket): void {
    this.clients.delete(client); // tmp
    Logger.debug(
      `Disconnect GameWebSocket[${client.remoteAddress} -> ${client.remoteURL}]`,
    );
  }

  @SubscribeMessage(GameServerOpcode.HANDSHAKE)
  handleHandshake(client: GameWebSocket, _payload: ByteBuffer) {
    assert(client.auth.auth_level === AuthLevel.COMPLETED);

    const uuid = client.auth.user_id;
    client.uuid = uuid;
    this.clients.add(client); // tmp
  }

  @SubscribeMessage(GameServerOpcode.CREATE)
  handleCreate(client: GameWebSocket, _payload: ByteBuffer): ByteBuffer {
    // const roomTitle: string = payload.readString();
    const roomUUID: string = NULL_UUID
    this.gameRoomList.set(roomUUID, [client.uuid])
    const buf = ByteBuffer.createWithOpcode(GameClientOpcode.ACCEPT);
    buf.writeUUID(roomUUID);
    return buf;
  }

  @SubscribeMessage(GameServerOpcode.JOIN)
  handleJoin(client: GameWebSocket, payload: ByteBuffer): ByteBuffer {
    const roomUUID: string = payload.readString();
    const members: string[] | undefined = this.gameRoomList.get(roomUUID);
    if (members === undefined || members.length > 2) {
      return ByteBuffer.createWithOpcode(GameClientOpcode.REJECT);
    }
    else {
      members.push(client.uuid);
    }
    const buf = ByteBuffer.createWithOpcode(GameClientOpcode.ACCEPT);
    return buf;
  }

  @SubscribeMessage(GameServerOpcode.START)
  handleStrat(client: GameWebSocket, payload: ByteBuffer) {
    const roomUUID: string = payload.readString();
    const members: string[] | undefined = this.gameRoomList.get(roomUUID);
    if (members === undefined) {
      client.send(ByteBuffer.createWithOpcode(GameClientOpcode.REJECT).toArray());
      return;
    }
    const buf = ByteBuffer.createWithOpcode(GameClientOpcode.START);
    for (const _clinet of this.clients) {
      if (members.includes(_clinet.uuid)) {
        _clinet.send(buf.toArray());
        break;
      }
    }
  }

  @SubscribeMessage(GameServerOpcode.FRAME)
  getFrame(client: GameWebSocket, payload: ByteBuffer) {
    const player: number = payload.read1();
    const roomUUID: string = payload.readString();
    const frame: Frame = readFrame(payload);
    const frames = this.worldFrames.get(roomUUID);
    const members = this.gameRoomList.get(roomUUID);
    if (members === undefined) {
      return;//멤버가 서버에 존재하지 않울때!!
    }
    if (frames === undefined) {
      this.worldFrames.set(roomUUID, [{ fixed: false, frame }]);
      const buf = ByteBuffer.create(GameClientOpcode.SYNC);
      writeFrame(buf, frame);
      for (const _clinet of this.clients) {
        if (members.includes(_clinet.uuid) && _clinet !== client) {
          _clinet.send(buf.toArray());
          break;
        }
      }
    }
    else {
      if (frames.length === 0 || frames[frames.length - 1].frame.id < frame.id) {
        frames.push({ fixed: false, frame });
        const buf = ByteBuffer.create(GameClientOpcode.SYNC);
        writeFrame(buf, frame);
        for (const _clinet of this.clients) {
          if (members.includes(_clinet.uuid) && _clinet !== client) {
            _clinet.send(buf.toArray());
            break;
          }
        }
      }
      else {
        const resyncFrames = this.syncFrame(player, frames, frame);
        const buf = ByteBuffer.create(GameClientOpcode.RESYNC);
        writeFrames(buf, resyncFrames);
        for (const _clinet of this.clients) {
          if (members.includes(_clinet.uuid)) {
            _clinet.send(buf.toArray());
            break;
          }
        }
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

  private syncFrame(player: number, frames: { fixed: boolean, frame: Frame }[], frame: Frame): Frame[] {
    const sendFrames: Frame[] = [];
    const velocity = { x: 0, y: 0 };
    const prevPos = { x: 0, y: 0 };
    const ball: PhysicsAttribute = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } }
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].frame.id === frame.id) {
        frames[i].fixed == true;
        //프레임 패들 위치 속도 병합
        if (player === 1) {
          frames[i].frame.paddle1 = frame.paddle1;
          copy(velocity, frame.paddle1.velocity);
          copy(prevPos, frame.paddle1.position);
        }
        else {
          frames[i].frame.paddle2 = frame.paddle2;
          copy(velocity, frame.paddle2.velocity);
          copy(prevPos, frame.paddle2.position);
        }
        //프레임 공의 위치 속도 병합
        if (frame.paddle1Hit === true || frame.paddle2Hit === true) {
          frames[i].frame.ball = frame.ball;
        }
        getScore(frames[i].frame);
        copy(ball.velocity, frames[i].frame.ball.velocity);
        copy(ball.position, frames[i].frame.ball.position);
        sendFrames.push(frames[i].frame);
      }
      else if (frames[i].frame.id > frame.id) {
        prevPos.x += velocity.x;
        prevPos.y += velocity.y;
        if (player === 1) {
          copy(frames[i].frame.paddle1.position, prevPos);
          copy(frames[i].frame.paddle1.velocity, velocity);
        }
        else {
          copy(frames[i].frame.paddle2.position, prevPos);
          copy(frames[i].frame.paddle2.velocity, velocity);
        }
        ball.position.x += ball.velocity.x;
        ball.position.y += ball.velocity.y;
        copy(frames[i].frame.ball.position, ball.position);
        copy(frames[i].frame.ball.velocity, ball.velocity);
        // 자체 물리엔진 적용!
        physicsEngine(frames[i].frame);
        if (player === 1) {
          copy(prevPos, frames[i].frame.paddle1.position);
          copy(velocity, frames[i].frame.paddle1.velocity);
        }
        else {
          copy(prevPos, frames[i].frame.paddle2.position);
          copy(velocity, frames[i].frame.paddle2.velocity);
        }
        sendFrames.push(frames[i].frame);
      }
    }
    return (sendFrames);
  }
}

import { Logger } from "@nestjs/common";
import {
  BattleField,
  GameEarnScore,
  GameMemberParams,
  GameMemberStatistics,
  GameProgress,
  GameRoomParams,
  GameStatistics,
} from "@common/game-payloads";
import { GameEntity } from "@common/generated/types";
import { ByteBuffer } from "akasha-lib";
import { GameServer } from "./game.server";
import * as builder from "./game-payload-builder";
import {
  BALL_RADIUS,
  FOCUS_POS1,
  FOCUS_POS2,
  Frame,
  GOAL_RADIUS,
  GravityObj,
  HEIGHT,
  PADDLE_RADIUS,
  PhysicsAttribute,
  Vector2,
  WIDTH,
  vec_distance,
  vec_normalize,
  vec_unit,
  writeFrame,
} from "@common/game-physics-payloads";
import { GameClientOpcode } from "@common/game-opcodes";
import { GameService } from "./game.service";

export class GameRoom {
  readonly defaultMaxSet = 3;
  readonly defaultTimespan = 10 * 60 * 1000;
  readonly initialProgress = () => ({
    score: [0, 0],
    initialStartTime: Date.now(),
    totalTimespan: this.defaultTimespan,
    suspended: false,
    resumedTime: Date.now(),
    consumedTimespanSum: 0,
    resumeScheduleTime: null,
  });
  readonly defaultRestTime = 4000;
  readonly maxScore = 7;

  private updaterId: ReturnType<typeof setTimeout>;
  readonly members = new Map<string, GameMember>();
  readonly createdTimestamp = Date.now();
  unused = true;
  firstAllReady = 0;
  progress: GameProgress | undefined;
  earnScoreList = Array<GameEarnScore>();
  statistics: GameStatistics = { setProgress: [] };
  memberStatistics: GameMemberStatistics[] = [];

  constructor(
    readonly service: GameService,
    readonly server: GameServer,
    readonly props: GameEntity,
    readonly params: GameRoomParams,
    readonly ladder: boolean,
  ) {
    this.updaterId = this.registerUpdate(500);
  }

  addMember(
    accountId: string,
    skillRating: number,
    ratingDeviation: number,
  ): void {
    this.unused = false;
    const member = new GameMember(
      this,
      accountId,
      skillRating,
      ratingDeviation,
    );
    this.members.set(accountId, member);
    this.server.uniqueAction(accountId, (client) => {
      client.gameId = this.props.id;
      client.sendPayload(builder.makeGameRoom(this));
    });
    this.broadcast(builder.makeEnterMember(member), accountId);
  }

  updateMember(accountId: string, action: (member: GameMember) => void): void {
    const member: GameMember | undefined = this.members.get(accountId);
    if (member !== undefined) {
      action(member);
      this.broadcast(builder.makeUpdateMember(accountId, member));
    }
  }

  removeMember(accountId: string): void {
    this.server.uniqueAction(accountId, (client) => {
      client.gameId = undefined;
      client.closePosted = true;
    });
    if (this.members.delete(accountId)) {
      this.broadcast(builder.makeLeaveMember(accountId));
    }
  }

  nextTeam(): number {
    const values = [...this.members.values()];
    const count_0 = values.filter((e) => e.team === 0).length;
    const count_1 = values.filter((e) => e.team === 1).length;
    return count_0 <= count_1 ? 0 : 1;
  }

  allReady(): boolean {
    const values = [...this.members.values()];
    const allReady = values.every((e) => e.ready);
    const count_0 = values.filter((e) => e.team === 0).length;
    const count_1 = values.filter((e) => e.team === 1).length;
    return allReady && count_0 === count_1;
  }

  broadcast(buf: ByteBuffer, except?: string | undefined): void {
    for (const [key] of this.members) {
      if (key !== except) {
        this.server.unicast(key, buf);
      }
    }
  }

  private registerUpdate(delay: number) {
    return setTimeout(() => {
      this.update()
        .then(() => {
          this.updaterId = this.registerUpdate(delay);
        })
        .catch((e) => {
          Logger.error(`Failed update rooms: ${e}`, GameRoom.name);
        });
    }, delay);
  }

  async update(): Promise<void> {
    const progress = this.progress;
    if (progress === undefined) {
      if (this.ladder) {
        if (this.members.size >= this.params.limit) {
          await this.initialStart();
        }
      } else {
        if (this.allReady()) {
          if (this.firstAllReady === 0) {
            this.firstAllReady = Date.now();
          } else if (this.firstAllReady + this.defaultRestTime >= Date.now()) {
            await this.initialStart();
          }
        } else {
          if (this.firstAllReady !== 0) {
            this.firstAllReady = 0;
          }
        }
      }
    } else {
      //TODO: Exclude over-suspended users from the game
      if (progress.currentSet < progress.maxSet) {
        if (progress.suspended) {
          if (progress.resumeScheduleTime !== null) {
            if (progress.resumeScheduleTime >= Date.now()) {
              this.start();
            }
          }
        } else {
          if (
            progress.resumedTime +
              progress.totalTimespan -
              progress.consumedTimespanSum <
            Date.now()
          ) {
            if (this.members.size <= 1) {
              await this.finalEnd();
            } else {
              const values = [...this.members.values()];
              const count_0 = values.filter((e) => e.team === 0).length;
              const count_1 = values.filter((e) => e.team === 1).length;
              if (count_0 === 0 || count_1 === 0) {
                await this.finalEnd();
              } else {
                if (
                  progress.score[0] >= this.maxScore ||
                  progress.score[1] >= this.maxScore
                ) {
                  this.nextSet();
                }
              }
            }
          } else {
            this.nextSet();
          }
        }
      } else {
        await this.finalEnd();
      }
    }
  }

  async initialStart() {
    //TODO: skillRating precalc
    this.progress = {
      currentSet: 0,
      maxSet: this.defaultMaxSet,
      ...this.initialProgress(),
      suspended: true,
    };
    this.sendUpdateRoom();
  }

  start() {
    if (this.progress === undefined) {
      return;
    }
    if (!this.progress.suspended) {
      return;
    }
    this.progress.suspended = false;
    this.progress.resumedTime = Date.now();
    this.progress.resumeScheduleTime = null;
    this.sendUpdateRoom();
  }

  earnScore(accountId: string, team: number, value: number = 1) {
    if (this.progress === undefined) {
      return;
    }
    this.earnScoreList.push({
      accountId,
      team,
      value,
      timestamp: new Date(),
    });
    this.progress.score[team] += value;
    this.sendUpdateRoom();
  }

  nextSet() {
    if (this.progress === undefined) {
      return;
    }
    this.statistics.setProgress ??= [];
    this.statistics.setProgress.push({
      progress: this.progress,
      earnScore: this.earnScoreList,
    });
    this.progress = {
      ...this.progress,
      ...this.initialProgress(),
      currentSet: this.progress.currentSet + 1,
      suspended: true,
      resumeScheduleTime: Date.now() + this.defaultRestTime,
    };
    this.earnScoreList = [];
    this.sendUpdateRoom();
  }

  stop() {
    if (this.progress === undefined) {
      return;
    }
    if (this.progress.suspended) {
      return;
    }
    this.progress.suspended = true;
    this.progress.consumedTimespanSum += Date.now() - this.progress.resumedTime;
    this.progress.resumeScheduleTime = null;
    this.sendUpdateRoom();
  }

  async finalEnd() {
    if (this.progress === undefined) {
      return;
    }
    const incompleted = this.progress.currentSet < this.progress.maxSet;
    //TODO: record
    if (!incompleted && this.ladder) {
      //TODO: skillRating
    }
    //TODO: history
    this.broadcast(builder.makeGameResult());
    this.progress = undefined;
    this.sendUpdateRoom();
    this.dispose();
  }

  sendUpdateRoom() {
    this.broadcast(builder.makeUpdateGame(this.progress));
  }

  async dispose(): Promise<void> {
    clearTimeout(this.updaterId);
    for (const [key] of this.members) {
      this.server.uniqueAction(key, (client) => {
        client.gameId = undefined;
        client.closePosted = true;
      });
    }
    this.members.clear();
    await this.service.removeRoom(this.props.id);
  }

  //FIXME: 여기부터
  lastFrameId = 0;
  frames: { fixed: boolean; frame: Frame }[] = [];
  distanceLog = Array<number>();
  velocityLog = Array<number>();

  initPhysicsLog() {
    this.distanceLog = [0, 0];
    this.velocityLog = [0, 0];
  }

  addPhysicsLog(v1: Vector2, v2: Vector2) {
    this.distanceLog[0] += Math.sqrt(v1.x ** 2 + v1.y ** 2);
    this.distanceLog[1] += Math.sqrt(v2.x ** 2 + v2.y ** 2);
  }

  calcAvgVelocity() {
    this.velocityLog[0] = this.distanceLog[0] / this.lastFrameId;
    this.velocityLog[1] = this.distanceLog[1] / this.lastFrameId;
  }

  processFrame(accountId: string, frame: Frame) {
    if (this.frames.length === 0) {
      this.frames.push({ fixed: false, frame });
    } else {
      if (this.frames[this.frames.length - 1].frame.id < frame.id) {
        this.frames.push({ fixed: false, frame: frame });
      } else {
        const resyncFrame = this.syncFrame(accountId, frame);
        //FIXME: 세트가 끝나면 velocity 계산하고 기록한다. 이어서 새로운 그래비티 오브젝트 생성, 물리 로그 초기화, 프레임 목록 초기화!

        const buf = ByteBuffer.createWithOpcode(
          resyncFrame.allSync
            ? GameClientOpcode.RESYNC_ALL
            : GameClientOpcode.RESYNC_PART,
        );
        buf.writeNullable(resyncFrame.frame ?? null, writeFrame);
        this.broadcast(buf);

        let count = 0;
        for (; count < this.frames.length; count++) {
          if (!this.frames[count].fixed) {
            break;
          }
        }
        this.frames.splice(0, count);
      }
    }
  }

  syncFrame(
    accountId: string,
    frame: Frame,
  ): {
    allSync: boolean;
    frame: Frame | null;
  } {
    const member = this.members.get(accountId);
    if (member === undefined) {
      throw new Error();
    }
    const serverFrameEntryIndex = this.frames.findIndex(
      (e) => e.frame.id === frame.id,
    );
    if (serverFrameEntryIndex !== -1) {
      for (let i = 0; i < serverFrameEntryIndex; i++) {
        this.frames[i].fixed = true;
      }

      const serverFrame = this.frames[serverFrameEntryIndex].frame;

      //프레임 패들 위치 속도 병합
      if (member.team === 0) {
        //XXX: 내 패들에 대해서만 덮어씌우게 만든 것 같다.
        serverFrame.paddle1 = frame.paddle1;
      } else {
        serverFrame.paddle2 = frame.paddle2;
      }

      //프레임 공의 위치 속도 병합
      if (
        (member.team === 0 && frame.paddle1Hit) || //XXX: 내 패들에 충돌한 경우만 더 강하게 검사한 것 같다.
        (member.team === 1 && frame.paddle2Hit)
      ) {
        if (!GameRoom.ballDiffCheck_Hard(serverFrame.ball, frame.ball)) {
          serverFrame.ball = frame.ball;
        }
      }

      this.physicsEngine(accountId, serverFrame);

      // For log
      this.addPhysicsLog(
        serverFrame.paddle1.velocity,
        serverFrame.paddle2.velocity,
      );
      this.lastFrameId = serverFrame.id;
    }

    const serverFrame =
      serverFrameEntryIndex !== -1
        ? this.frames[serverFrameEntryIndex]?.frame
        : undefined;
    return {
      allSync:
        serverFrame === undefined ||
        serverFrame.paddle1Hit ||
        serverFrame.paddle2Hit ||
        !GameRoom.ballDiffCheck_Easy(serverFrame.ball, frame.ball),
      frame: serverFrame ?? null,
    };
  }

  private static ballDiffCheck_Easy(
    ball1: PhysicsAttribute,
    ball2: PhysicsAttribute,
  ): boolean {
    if (Math.abs(ball1.position.x - ball2.position.x) > 30) {
      return false;
    }
    if (Math.abs(ball1.position.y - ball2.position.y) > 30) {
      return false;
    }
    return true;
  }

  private static ballDiffCheck_Hard(
    ball1: PhysicsAttribute,
    ball2: PhysicsAttribute,
  ): boolean {
    if (Math.abs(ball1.position.x - ball2.position.x) > 15) {
      return false;
    }
    if (Math.abs(ball1.position.y - ball2.position.y) > 15) {
      return false;
    }
    if (Math.abs(ball1.velocity.x - ball2.velocity.x) > 1) {
      return false;
    }
    if (Math.abs(ball1.velocity.y - ball2.velocity.y) > 1) {
      return false;
    }
    return true;
  }

  static createGravityObjs(): GravityObj[] {
    const random = (min: number, max: number): number => {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    const gravities: GravityObj[] = [];
    const random1 = random(1, 10) % 2;
    const random2 = random(1, 10) % 2;
    const sign1 = random1 === 1 ? 1 : -1;
    const sign2 = random2 === 1 ? 1 : -1;
    gravities.push({
      pos: { x: random(100, 900), y: random(200, 960) },
      radius: random(40, 50),
      force: (sign1 * random(1, 5)) / 6,
    });
    gravities.push({
      pos: { x: random(100, 900), y: random(960, 1770) },
      radius: random(30, 40),
      force: (sign2 * random(1, 5)) / 8,
    });
    return gravities;
  }

  static paddleReflection(ballV: Vector2, normal: Vector2) {
    const velocity = { x: ballV.x, y: ballV.y };
    const normalVec = normal;
    if (normalVec.x * velocity.x + normalVec.y * velocity.y >= 0) {
      const theta = Math.atan2(normalVec.y, normalVec.x);
      const alpha = Math.atan2(velocity.y, velocity.x);
      const newVx =
        velocity.x * Math.cos(2 * theta - 2 * alpha) -
        velocity.y * Math.sin(2 * theta - 2 * alpha);
      const newVy =
        velocity.x * Math.sin(2 * theta - 2 * alpha) +
        velocity.y * Math.cos(2 * theta - 2 * alpha);
      ballV.x = newVx * -1.1;
      ballV.y = newVy * -1.1;
    }
  }

  checkScore(accountId: string, frame: Frame) {
    //XXX: earnScore에 accountId가 들어갈게 아니라 마지막으로 공을 친 유저가 들어가야 한다.
    const field: BattleField = this.params.battleField;
    if (field === BattleField.SQUARE) {
      if (frame.ball.position.y < BALL_RADIUS) {
        this.earnScore(accountId, 0);
        frame.ball.position.x = WIDTH / 2;
        frame.ball.position.y = HEIGHT / 2;
        frame.ball.velocity.x = -15;
        frame.ball.velocity.y = -15;
      } else if (frame.ball.position.y > HEIGHT - BALL_RADIUS) {
        this.earnScore(accountId, 1);
        frame.ball.position.x = WIDTH / 2;
        frame.ball.position.y = HEIGHT / 2;
        frame.ball.velocity.x = 15;
        frame.ball.velocity.y = 15;
      }
    } else if (field === BattleField.ROUND) {
      if (
        vec_distance(frame.ball.position, FOCUS_POS1) <=
        GOAL_RADIUS + BALL_RADIUS
      ) {
        this.earnScore(accountId, 1);
        frame.ball.position.x = WIDTH / 2;
        frame.ball.position.y = HEIGHT / 2;
        frame.ball.velocity.x = 15;
        frame.ball.velocity.y = 15;
      } else if (
        vec_distance(frame.ball.position, FOCUS_POS2) <=
        GOAL_RADIUS + BALL_RADIUS
      ) {
        this.earnScore(accountId, 0);
        frame.ball.position.x = WIDTH / 2;
        frame.ball.position.y = HEIGHT / 2;
        frame.ball.velocity.x = -15;
        frame.ball.velocity.y = -15;
      }
    }
  }

  physicsEngine(accountId: string, frame: Frame) {
    frame.paddle1Hit = false;
    frame.paddle2Hit = false;
    if (
      vec_distance(frame.ball.position, frame.paddle1.position) <=
      BALL_RADIUS + PADDLE_RADIUS
    ) {
      const normalVec = vec_normalize(
        frame.ball.position,
        frame.paddle1.position,
      );
      const unitVec = vec_unit(normalVec);
      frame.ball.position.x =
        frame.paddle1.position.x + (BALL_RADIUS + PADDLE_RADIUS) * unitVec.x;
      frame.ball.position.y =
        frame.paddle1.position.y + (BALL_RADIUS + PADDLE_RADIUS) * unitVec.y;
      GameRoom.paddleReflection(frame.ball.velocity, normalVec);
      frame.paddle1Hit = true;
      frame.ball.velocity.x += frame.paddle1.velocity.x / 8;
      frame.ball.velocity.y += frame.paddle1.velocity.y / 8;
    } else if (
      vec_distance(frame.ball.position, frame.paddle2.position) <=
      BALL_RADIUS + PADDLE_RADIUS
    ) {
      const normalVec = vec_normalize(
        frame.ball.position,
        frame.paddle2.position,
      );
      const unitVec = vec_unit(normalVec);
      frame.ball.position.x =
        frame.paddle2.position.x + (BALL_RADIUS + PADDLE_RADIUS) * unitVec.x;
      frame.ball.position.y =
        frame.paddle2.position.y + (BALL_RADIUS + PADDLE_RADIUS) * unitVec.y;
      GameRoom.paddleReflection(frame.ball.velocity, normalVec);
      frame.paddle2Hit = true;
      frame.ball.velocity.x += frame.paddle2.velocity.x / 8;
      frame.ball.velocity.y += frame.paddle2.velocity.y / 8;
    }
    this.checkScore(accountId, frame);
  }

  //FIXME: 여기까지
}

export class GameMember implements GameMemberParams {
  character = 0;
  specification = 0;
  team: number;
  ready = false;

  constructor(
    readonly room: GameRoom,
    readonly accountId: string,
    readonly skillRating: number,
    readonly ratingDeviation: number,
  ) {
    this.team = this.room.nextTeam();
  }

  accomplish(achievementId: number): void {
    this.room.service
      .accomplishAchievement(this.accountId, achievementId)
      .then(() =>
        this.room.broadcast(
          builder.makeAchievement(this.accountId, achievementId),
        ),
      )
      .catch(() => {
        //NOTE: ignore
      });
  }
}

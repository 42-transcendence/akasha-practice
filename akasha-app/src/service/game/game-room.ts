import { Logger } from "@nestjs/common";
import {
  BattleField,
  GameEarnScore,
  GameMemberParams,
  GameMemberStatistics,
  GameMode,
  GameOutcome,
  GameProgress,
  GameRoomParams,
  GameStatistics,
} from "@common/game-payloads";
import { GameEntity } from "@common/generated/types";
import { ByteBuffer, NULL_UUID } from "akasha-lib";
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
import * as Glicko from "./game-rating";

export class GameRoom {
  readonly defaultMaxSet = 3;
  readonly defaultTimespan = 10 * 60 * 1000;
  readonly initialProgress = {
    totalTimespan: this.defaultTimespan,
    suspended: false,
    consumedTimespanSum: 0,
    resumeScheduleTime: null,
  };
  readonly defaultRestTime = 4000;
  readonly maxScore = 5;

  private updaterId: ReturnType<typeof setTimeout>;
  readonly members = new Map<string, GameMember>();
  readonly createdTimestamp = Date.now();
  unused = true;
  firstAllReady = 0;
  progress: GameProgress | undefined;
  earnScoreList = Array<GameEarnScore>();
  progresseStatistics: GameProgress[] = [];
  earnScoreStatistics: GameEarnScore[][] = [];
  initialTimestamp = new Date();
  initialTeams = new Map<string, number>();
  initialRatings: Map<string, Glicko.Rating> | undefined;

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
          if (e instanceof Error) {
            Logger.error(e.stack);
          }
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
        if (this.members.size > 1 && this.allReady()) {
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
            if (progress.resumeScheduleTime < Date.now()) {
              this.broadcast(builder.makeCountdown(-1));
              //FIXME: GravityObject
              if (this.params.gameMode === GameMode.GRAVITY) {
                this.broadcast(
                  builder.makeGravityObjs(this.generateGravityObjs()),
                );
              }
              this.start();
            } else {
              this.broadcast(
                builder.makeCountdown(
                  Math.ceil(progress.resumeScheduleTime - Date.now()) / 1000,
                ),
              );
            }
          }
        } else {
          if (
            progress.resumedTime +
              progress.totalTimespan -
              progress.consumedTimespanSum <
            Date.now()
          ) {
            this.nextSet();
          } else {
            if (this.members.size <= 1) {
              await this.giveUp();
            } else {
              const values = [...this.members.values()];
              const count_0 = values.filter((e) => e.team === 0).length;
              const count_1 = values.filter((e) => e.team === 1).length;
              if (count_0 === 0 || count_1 === 0) {
                await this.giveUp();
              } else {
                if (
                  progress.score[0] >= this.maxScore ||
                  progress.score[1] >= this.maxScore
                ) {
                  this.nextSet();
                }
              }
            }
          }
        }
      } else {
        await this.finalEnd();
      }
    }
  }

  async initialStart() {
    this.initialTimestamp = new Date();
    this.initialTeams = [...this.members].reduce(
      (map, [key, val]) => map.set(key, val.team),
      new Map<string, number>(),
    );
    if (this.ladder) {
      this.initialRatings = [...this.members].reduce(
        (map, [key, val]) =>
          map.set(key, { sr: val.skillRating, rd: val.ratingDeviation }),
        new Map<string, Glicko.Rating>(),
      );
    }
    this.progress = {
      ...this.initialProgress,
      currentSet: 0,
      score: [0, 0], //FIXME: 2개팀 전제
      maxSet: this.defaultMaxSet,
      initialStartTime: Date.now(),
      suspended: true,
      resumedTime: Date.now(),
      resumeScheduleTime: Date.now() + this.defaultRestTime,
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
    if (
      this.progress.score[0] < this.maxScore &&
      this.progress.score[1] < this.maxScore
    ) {
      this.progress.suspended = true;
      this.progress.consumedTimespanSum +=
        Date.now() - this.progress.resumedTime;
      this.progress.resumeScheduleTime = Date.now() + 500; //TODO: 0.5초 딜레이???
    }
    this.progress.score[team] += value;

    //FIXME: TEMPORARY!!
    this.broadcast(
      builder.makeEndOfRally(this.progress.currentSet, team, value),
    );

    this.sendUpdateRoom();
  }

  nextSet() {
    if (this.progress === undefined) {
      return;
    }

    // Stop
    this.progress.suspended = true;
    this.progress.consumedTimespanSum += Date.now() - this.progress.resumedTime;
    this.progress.resumeScheduleTime = null;

    //XXX: 세트가 끝나면 velocity 계산하고 기록한다. 이어서 새로운 그래비티 오브젝트 생성, 물리 로그 초기화, 프레임 목록 초기화!
    this.calcAvgVelocity();
    this.lastFrameId = 0;
    this.lastHitId = NULL_UUID;
    this.frames = [];
    this.distanceLog = [];
    this.velocityLog = [];

    // Save
    this.progresseStatistics.push(this.progress);
    this.earnScoreStatistics.push(this.earnScoreList);

    //FIXME: TEMPORARY!!
    this.broadcast(
      builder.makeEndOfSet(
        this.progress.currentSet,
        this.progress.score[0],
        this.progress.score[1],
      ),
    );

    // Initialize
    this.progress = {
      ...this.progress,
      ...this.initialProgress,
      currentSet: this.progress.currentSet + 1,
      score: [0, 0], //FIXME: 2개팀 전제
      initialStartTime: Date.now(),
      suspended: true,
      resumedTime: Date.now(),
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

  async giveUp() {
    if (this.progress === undefined) {
      return;
    }
    // Stop
    this.progress.suspended = true;
    this.progress.consumedTimespanSum += Date.now() - this.progress.resumedTime;
    this.progress.resumeScheduleTime = null;

    // Save
    this.progresseStatistics.push(this.progress);
    this.earnScoreStatistics.push(this.earnScoreList);

    await this.finalEnd();
  }

  static getOutcomeValue(outcome: GameOutcome): number {
    //FIXME: 세트 점수 미사용 전제
    switch (outcome) {
      case GameOutcome.WIN:
        return 1;
      case GameOutcome.LOSE:
        return 0;
      case GameOutcome.TIE:
        return 0.5;
      case GameOutcome.NONE:
        return 0;
    }
  }

  async finalEnd() {
    if (this.progress === undefined) {
      return;
    }
    const incompleted = this.progress.currentSet < this.progress.maxSet;
    const finalTeams = [...this.members].reduce(
      (map, [key, val]) => map.set(key, val.team),
      new Map<string, number>(),
    );
    //FIXME: 2개팀 전제
    let totalScore_0 = 0;
    let totalScore_1 = 0;
    for (const progress of this.progresseStatistics) {
      //FIXME: 2개팀 전제
      const score_0 = progress.score[0];
      const score_1 = progress.score[1];

      if (score_0 > score_1) {
        totalScore_0++;
      } else if (score_0 < score_1) {
        totalScore_1++;
      }
    }
    const outcomeMap = new Map<number, GameOutcome>();
    //FIXME: 2개팀 전제
    if (totalScore_0 > totalScore_1) {
      outcomeMap.set(0, GameOutcome.WIN);
      outcomeMap.set(1, GameOutcome.LOSE);
    } else if (totalScore_0 < totalScore_1) {
      outcomeMap.set(0, GameOutcome.LOSE);
      outcomeMap.set(1, GameOutcome.WIN);
    } else {
      outcomeMap.set(0, GameOutcome.TIE);
      outcomeMap.set(1, GameOutcome.TIE);
    }
    let finalRatings: Map<string, Glicko.Rating> | undefined;
    if (!incompleted && this.initialRatings !== undefined) {
      finalRatings = new Map<string, Glicko.Rating>();
      for (const [accountId, rating] of this.initialRatings) {
        const opponents = [...this.initialRatings]
          .filter(([key]) => key !== accountId)
          .map(([, val]) => val);
        const team = this.initialTeams.get(accountId);
        if (team === undefined) {
          continue;
        }
        const outcomeValue = GameRoom.getOutcomeValue(
          outcomeMap.get(team) ?? GameOutcome.NONE,
        );
        finalRatings.set(
          accountId,
          Glicko.apply(rating, opponents, outcomeValue),
        );
      }
    }
    // Collect statistics
    const statistics: GameStatistics = {
      gameId: this.props.id,
      params: this.params,
      ladder: this.ladder,
      timestamp: this.initialTimestamp,
      progresses: this.progresseStatistics,
      earnScores: this.earnScoreStatistics,
    };
    const memberStatistics: GameMemberStatistics[] = [];
    for (const [accountId, team] of this.initialTeams) {
      memberStatistics.push({
        accountId,
        team,
        final: finalTeams.has(accountId),
        outcome: outcomeMap.get(team) ?? GameOutcome.NONE,
        initialSkillRating: this.initialRatings?.get(accountId)?.sr,
        initialRatingDeviation: this.initialRatings?.get(accountId)?.rd,
        finalSkillRating: finalRatings?.get(accountId)?.sr,
        finalRatingDeviation: finalRatings?.get(accountId)?.rd,
      });
    }
    await this.service.saveGameResult(statistics, memberStatistics);
    this.broadcast(builder.makeGameResult(statistics, memberStatistics));
    this.broadcast(builder.makeEndOfGame(incompleted));
    this.progress = undefined;
    this.sendUpdateRoom();
    await this.dispose();
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
  lastHitId: string = NULL_UUID;
  lastGoalTeam = 0;
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

      this.physicsEngine(serverFrame);

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

  checkScore(frame: Frame) {
    //XXX: earnScore에 accountId가 들어갈게 아니라 마지막으로 공을 친 유저가 들어가야 한다.
    if (frame.paddle1Hit) {
      this.lastHitId =
        [...this.members].find(([, v]) => v.team === 0)?.[1].accountId ?? "";
    } else if (frame.paddle2Hit) {
      this.lastHitId =
        [...this.members].find(([, v]) => v.team === 1)?.[1].accountId ?? "";
    }

    const field: BattleField = this.params.battleField;
    if (field === BattleField.SQUARE) {
      if (frame.ball.position.y < BALL_RADIUS) {
        this.lastGoalTeam = 0;
        this.earnScore(this.lastHitId, 0);
      } else if (frame.ball.position.y > HEIGHT - BALL_RADIUS) {
        this.lastGoalTeam = 1;
        this.earnScore(this.lastHitId, 1);
      }
    } else if (field === BattleField.ROUND) {
      if (
        vec_distance(frame.ball.position, FOCUS_POS2) <=
        GOAL_RADIUS + BALL_RADIUS
      ) {
        this.lastGoalTeam = 0;
        this.earnScore(this.lastHitId, 0);
      } else if (
        vec_distance(frame.ball.position, FOCUS_POS1) <=
        GOAL_RADIUS + BALL_RADIUS
      ) {
        this.lastGoalTeam = 1;
        this.earnScore(this.lastHitId, 1);
      }
    }
  }

  physicsEngine(frame: Frame) {
    frame.paddle1Hit = false;
    frame.paddle2Hit = false;
    if (this.progress?.suspended ?? true) {
      if (this.lastGoalTeam === 0) {
        frame.ball.position.x = WIDTH / 2;
        frame.ball.position.y = (1 * HEIGHT) / 3;
      } else {
        frame.ball.position.x = WIDTH / 2;
        frame.ball.position.y = (2 * HEIGHT) / 3;
      }
      frame.ball.velocity.x = 0;
      frame.ball.velocity.y = 0;
      return;
    }
    if (
      this.progress !== undefined &&
      (this.progress.score[0] >= this.maxScore ||
        this.progress.score[1] >= this.maxScore)
    ) {
      frame.ball.position.x = WIDTH / 2;
      frame.ball.position.y = WIDTH / 2;
      frame.ball.velocity.x = 0;
      frame.ball.velocity.y = 0;
      return;
    }

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
    this.checkScore(frame);
  }

  static makeRandom(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  generateGravityObjs() {
    const gravities: GravityObj[] = [];
    const random1 = GameRoom.makeRandom(1, 10) % 2;
    const random2 = GameRoom.makeRandom(1, 10) % 2;
    const sign1 = random1 === 1 ? 1 : -1;
    const sign2 = random2 === 1 ? 1 : -1;
    gravities.push({
      pos: {
        x: GameRoom.makeRandom(100, 900),
        y: GameRoom.makeRandom(200, 960),
      },
      radius: GameRoom.makeRandom(40, 50),
      force: (sign1 * GameRoom.makeRandom(1, 5)) / 6,
    });
    gravities.push({
      pos: {
        x: GameRoom.makeRandom(100, 900),
        y: GameRoom.makeRandom(960, 1770),
      },
      radius: GameRoom.makeRandom(30, 40),
      force: (sign2 * GameRoom.makeRandom(1, 5)) / 8,
    });
    return gravities;
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

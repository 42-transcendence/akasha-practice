import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { GameConfiguration } from "./game-config";
import { PrismaService } from "@/prisma/prisma.service";
import {
  GameInvitationPayload,
  GameMemberParams,
  GameProgress,
  GameRoomEnterResult,
  GameRoomParams,
  isGameInvitationPayload,
} from "@common/game-payloads";
import { GameEntity } from "@common/generated/types";
import { ByteBuffer, jwtVerifyHMAC } from "akasha-lib";
import { GameServer } from "./game.server";
import * as builder from "./game-payload-builder";
import { Prisma } from "@prisma/client";

/// AcceptInvitationResult
type AcceptInvitationResult =
  | { errno: GameRoomEnterResult.SUCCESS; room: GameRoom }
  | { errno: Exclude<GameRoomEnterResult, GameRoomEnterResult.SUCCESS> };

@Injectable()
export class GameService implements OnApplicationBootstrap, OnModuleDestroy {
  protected static readonly logger = new Logger(GameService.name);

  private readonly config: GameConfiguration;
  private readonly rooms = new Map<string, GameRoom>();

  constructor(
    env: ConfigService,
    private readonly prisma: PrismaService,
    private readonly server: GameServer,
  ) {
    const config = GameConfiguration.load(env);
    this.config = config;
  }

  async onApplicationBootstrap(): Promise<void> {
    const oldGameServer = await this.prisma.gameServer.findUnique({
      where: { id: this.config.unique_id },
    });
    if (oldGameServer !== null) {
      GameService.logger.fatal(
        "An active game server with the same unique ID already exists. The unique ID may have been misconfigured or the previous session may have been crashed.",
      );
      // throw new Error();
      //FIXME: DEV
      void (await this.prisma.gameServer.delete({
        where: { id: this.config.unique_id },
      }));
    }

    const gameServer = await this.prisma.gameServer.create({
      data: { id: this.config.unique_id },
    });
    void gameServer;
  }

  async onModuleDestroy(): Promise<void> {
    const promises = Array<Promise<void>>();
    for (const room of this.rooms.values()) {
      promises.push(room.dispose());
    }
    this.rooms.clear();
    void (await Promise.allSettled(promises));

    try {
      void (await this.prisma.gameServer.delete({
        where: { id: this.config.unique_id },
      }));
    } catch (e) {
      GameService.logger.fatal(
        "Game servers with the same unique ID have already disappeared from the list. The unique ID may have been configured as a duplicate or may have been deleted manually.",
      );
    }
  }

  async extractInvitation(
    token: string,
  ): Promise<GameInvitationPayload | null> {
    const verify = await jwtVerifyHMAC(
      token,
      GameConfiguration.JWT_ALGORITHM,
      this.config.jwt_secret,
      this.config.jwt_options,
    );

    if (!verify.success) {
      return null;
    }

    const payload: Record<string, unknown> = verify.payload;
    if (!isGameInvitationPayload(payload)) {
      throw new Error("Unexpected JWT Payload");
    }
    return payload;
  }

  async createNewRoom(
    params: GameRoomParams,
    ladder: boolean,
  ): Promise<GameEntity> {
    const game = await this.prisma.game.create({
      data: {
        serverId: this.config.unique_id,
        code: ladder ? null : undefined,
      },
    });
    const room = new GameRoom(this, this.server, game, params, ladder);
    this.rooms.set(room.props.id, room);
    return room.props;
  }

  async removeRoom(gameId: string): Promise<void> {
    if (this.rooms.delete(gameId)) {
      try {
        void (await this.prisma.game.delete({ where: { id: gameId } }));
      } catch (e) {
        GameService.logger.fatal(
          "Game room has already disappeared from database.",
        );
      }
    }
  }

  @Interval(10000)
  pruneUnusedRoom() {
    const now = Date.now();
    GameService.logger.debug(`Before prune rooms: ${this.rooms.size}`);

    const promises = Array<Promise<void>>();
    for (const [, room] of this.rooms) {
      if (room.unused && room.createdTimestamp + 7000 < now) {
        promises.push(room.dispose()); //NOTE: concurrent modification
      }
    }
    Promise.all(promises)
      .then(() => {
        GameService.logger.debug(`After prune rooms: ${this.rooms.size}`);
      })
      .catch((e) => {
        GameService.logger.error(`Failed prune rooms: ${e}`);
      });
  }

  getRoom(gameId: string): GameRoom | undefined {
    return this.rooms.get(gameId);
  }

  async acceptInvitation(
    accountId: string,
    token: string,
  ): Promise<AcceptInvitationResult> {
    const invitation: GameInvitationPayload | null =
      await this.extractInvitation(token);
    if (invitation === null) {
      return { errno: GameRoomEnterResult.EXPIRED_INVITATION };
    }
    if (invitation.user_id !== accountId) {
      return { errno: GameRoomEnterResult.ACCOUNT_MISMATCH };
    }
    if (invitation.server_id !== this.config.unique_id) {
      return { errno: GameRoomEnterResult.SERVER_MISMATCH };
    }
    const observer = invitation.observer !== undefined;
    const room: GameRoom | undefined = this.rooms.get(invitation.game_id);
    if (room === undefined) {
      return { errno: GameRoomEnterResult.NOT_FOUND };
    }
    return await this.prisma.$transaction(async (tx) => {
      if (!observer) {
        const account = await tx.account.findUniqueOrThrow({
          where: { id: accountId },
          select: { game: true },
        });
        const game = account.game;
        if (game === null) {
          // EnterRoom
          if (room.members.size >= room.params.limit) {
            return { errno: GameRoomEnterResult.EXCEED_LIMIT };
          }
          if (room.progress !== undefined) {
            return { errno: GameRoomEnterResult.ALREADY_STARTED };
          }
          void (await tx.account.update({
            where: { id: accountId },
            data: { gameId: room.props.id },
          }));
          room.addMember(accountId);
        } else {
          // ResumeRoom
          if (game.id !== invitation.game_id) {
            return { errno: GameRoomEnterResult.GAME_MISMATCH };
          }
          //TODO: room.resumePlayer
          throw new Error("Not implemented");
        }
      } else {
        // ObserveRoom
        //TODO: room.addObserver
        throw new Error("Not implemented");
      }
      return { errno: GameRoomEnterResult.SUCCESS, room };
    });
  }

  async notifyDisconnect(accountId: string, gameId: string): Promise<void> {
    const room: GameRoom | undefined = this.rooms.get(gameId);
    if (room !== undefined) {
      //TODO: room.suspendPlayer if `room.started`
      room.removeMember(accountId);
      try {
        void (await this.prisma.account.update({
          where: { id: accountId },
          data: { gameId: null },
        }));
      } catch (e) {
        GameService.logger.fatal("Game has already disappeared from database.");
      }
      if (room.members.size === 0) {
        await room.dispose();
      }
    }
  }

  async accomplishAchievement(
    accountId: string,
    achievementId: number,
  ): Promise<boolean> {
    try {
      void (await this.prisma.achievement.create({
        data: { accountId, achievementId },
      }));
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") {
          return false;
        }
      }
      GameService.logger.error(`Failed accomplish achievement: ${e}`);
      throw e;
    }
  }
}

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

  private updaterId: ReturnType<typeof setTimeout>;
  readonly members = new Map<string, GameMember>();
  readonly createdTimestamp = Date.now();
  unused = true;
  firstAllReady = 0;
  progress: GameProgress | undefined;

  constructor(
    readonly service: GameService,
    readonly server: GameServer,
    readonly props: GameEntity,
    readonly params: GameRoomParams,
    readonly ladder: boolean,
  ) {
    this.updaterId = this.registerUpdate(500);
  }

  addMember(accountId: string): void {
    this.unused = false;
    const member = new GameMember(this, accountId);
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
    const count_0 = values.filter((e) => e.team === 0);
    const count_1 = values.filter((e) => e.team === 1);
    return count_0 <= count_1 ? 0 : 1;
  }

  allReady(): boolean {
    const values = [...this.members.values()];
    const allReady = values.every((e) => e.ready);
    const count_0 = values.filter((e) => e.team === 0);
    const count_1 = values.filter((e) => e.team === 1);
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
          this.initialStart();
        }
      } else {
        if (this.allReady()) {
          if (this.firstAllReady === 0) {
            this.firstAllReady = Date.now();
          } else if (this.firstAllReady + this.defaultRestTime >= Date.now()) {
            this.initialStart();
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
              this.sendUpdateRoom();
            }
          }
        } else {
          if (
            progress.resumedTime +
              progress.totalTimespan -
              progress.consumedTimespanSum <
            Date.now()
          ) {
            // In Progress
            //TODO: 게임에 1명 이하만 남은 경우
            //TODO: 한 팀이 모두 없는 경우
          } else {
            // Next set
            progress.currentSet++;
            this.progress = {
              ...progress,
              ...this.initialProgress(),
              suspended: true,
              resumeScheduleTime: Date.now() + this.defaultRestTime,
            };
            this.broadcast(builder.makeGameIntermediateResult());
            this.sendUpdateRoom();
          }
        }
      } else {
        this.broadcast(builder.makeGameFinalResult());
        this.finalEnd();
      }
    }
  }

  initialStart() {
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

  finalEnd() {
    this.progress = undefined;
    this.sendUpdateRoom();
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
}

export class GameMember implements GameMemberParams {
  character = 0;
  specification = 0;
  team: number;
  ready = false;

  constructor(
    readonly room: GameRoom,
    readonly accountId: string,
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

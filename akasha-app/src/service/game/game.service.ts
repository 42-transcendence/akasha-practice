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
  GameRoomEnterResult,
  GameRoomParams,
  isGameInvitationPayload,
} from "@common/game-payloads";
import { GameEntity } from "@common/generated/types";
import { ByteBuffer, jwtVerifyHMAC } from "akasha-lib";
import { GameServer } from "./game.server";
import * as builder from "./game-payload-builder";

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
    for (const room of this.rooms.values()) {
      room.dispose();
    }
    this.rooms.clear();
    try {
      const gameServer = await this.prisma.gameServer.delete({
        where: { id: this.config.unique_id },
      });
      void gameServer;
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
        this.prisma.game.delete({ where: { id: gameId } });
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

    for (const [, room] of this.rooms) {
      if (room.unused && room.createdTimestamp + 7000 < now) {
        room.dispose(); //NOTE: concurrent modification
      }
    }

    GameService.logger.debug(`After prune rooms: ${this.rooms.size}`);
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
          if (room.started) {
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
        room.dispose();
      }
    }
  }
}

export class GameRoom {
  private readonly updaterId: ReturnType<typeof setInterval>;
  readonly members = new Map<string, GameMember>();
  readonly createdTimestamp = Date.now();
  unused = true;
  started = false;

  constructor(
    readonly service: GameService,
    readonly server: GameServer,
    readonly props: GameEntity,
    readonly params: GameRoomParams,
    readonly ladder: boolean,
  ) {
    this.updaterId = setInterval(() => this.update(), 500);
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
    return count_0 < count_1 ? 0 : 1;
  }

  broadcast(buf: ByteBuffer, except?: string | undefined): void {
    for (const [key] of this.members) {
      if (key !== except) {
        this.server.unicast(key, buf);
      }
    }
  }

  update(): void {}

  dispose(): void {
    clearInterval(this.updaterId);
    for (const [key] of this.members) {
      this.server.uniqueAction(key, (client) => {
        client.gameId = undefined;
        client.closePosted = true;
      });
    }
    this.members.clear();
    this.service.removeRoom(this.props.id);
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
}

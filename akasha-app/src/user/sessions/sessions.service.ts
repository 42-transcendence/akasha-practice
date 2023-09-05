import { Injectable } from "@nestjs/common";
import { Authorization, Prisma, Session } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

export class InvalidSessionError extends Error {
  override get name() {
    return "InvalidSessionError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export class ReuseDetectError extends InvalidSessionError {
  constructor(
    readonly affectedCount: number,
    message?: string | undefined,
  ) {
    super(message);
  }

  override get name() {
    return "ReuseDetectError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

const sessionTree = Prisma.validator<Prisma.SessionDefaultArgs>()({
  include: { successor: true },
});
type SessionTree = Prisma.SessionGetPayload<typeof sessionTree>;

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNewTemporaryState(
    data: Prisma.AuthorizationCreateInput,
  ): Promise<Authorization> {
    return await this.prisma.authorization.create({ data });
  }

  async findAndDeleteTemporaryState(id: string): Promise<Authorization> {
    return await this.prisma.authorization.delete({ where: { id } });
  }

  async createNewSession(accountId: string): Promise<Session> {
    return await this.prisma.session.create({
      data: { accountId, isValid: true },
    });
  }

  async refreshSession(token: string): Promise<Session> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Check Previous Session
      const prevSession: SessionTree = await tx.session.findUniqueOrThrow({
        where: { token },
        include: { successor: true },
      });
      if (!prevSession.isValid) {
        throw new InvalidSessionError();
      }
      if (prevSession.successor !== null) {
        const affectedCount: number = await this.invalidateSession(
          prevSession.id,
        );
        throw new ReuseDetectError(affectedCount);
      }

      // 2. Create Next Session
      const successorSession: Session = await tx.session.create({
        data: {
          accountId: prevSession.accountId,
          isValid: true,
          predecessorId: prevSession.id,
        },
      });
      return successorSession;
    });
  }

  async invalidateSession(id: bigint): Promise<number> {
    //XXX: 작성시 Prisma가 recursive를 지원하지 않았었음.
    const sql: Prisma.Sql = Prisma.sql`WITH RECURSIVE sessions_tree AS (
        SELECT s."id" FROM "services"."sessions" s WHERE "id" = ${id}
    UNION ALL
        SELECT s."id"
        FROM sessions_tree prev, "services"."sessions" s
        WHERE s."predecessorId" = prev."id"
    )
    UPDATE "services"."sessions" SET "isValid" = false
        WHERE "id" IN (SELECT "id" FROM sessions_tree)`;
    return await this.prisma.$executeRaw(sql);
  }
}

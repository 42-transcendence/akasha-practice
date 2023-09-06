import {
  MAX_NICK_TAG_NUMBER,
  MIN_NICK_TAG_NUMBER,
} from "@common/profile-constants";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

export type PrismaTransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

export type PrismaXClient = ReturnType<typeof extend>;
export type PrismaXTransactionClient = Parameters<
  Parameters<PrismaXClient["$transaction"]>[0]
>[0];

function extend(client: PrismaClient) {
  return client.$extends({
    model: {
      account: {
        async generateTagNumber(name: string, tagHint?: number | undefined) {
          //XXX: 작성시 Prisma가 프로시저 호출을 지원하지 않았었음.
          return await client.$queryRaw`
            SELECT "tagNumber"
              FROM generate_series(${MIN_NICK_TAG_NUMBER}, ${MAX_NICK_TAG_NUMBER}) AS "tagNumber"
              WHERE "tagNumber" NOT IN (
                SELECT a."nickTag" FROM "services"."accounts" a
                WHERE a."nickName" = ${name}
              )
              ORDER BY "tagNumber" = ${tagHint} DESC, random()
            LIMIT 1
          `;
        },
      },
      session: {
        async invalidateSessionTree(id: bigint): Promise<number> {
          //XXX: 작성시 Prisma가 recursive를 지원하지 않았었음.
          return await client.$executeRaw`
            WITH RECURSIVE sessions_tree AS (
              SELECT s."id" FROM "services"."sessions" s WHERE "id" = ${id}
            UNION ALL
              SELECT s."id"
              FROM sessions_tree prev, "services"."sessions" s
              WHERE s."predecessorId" = prev."id"
            )
            UPDATE "services"."sessions" SET "isValid" = false
              WHERE "id" IN (SELECT "id" FROM sessions_tree)
          `;
        },
      },
    },
  });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private _backing_x!: PrismaXClient;

  async onModuleInit() {
    this._backing_x = extend(this);
    await this._backing_x.$connect();
  }

  get x(): typeof this._backing_x {
    return this._backing_x;
  }
}

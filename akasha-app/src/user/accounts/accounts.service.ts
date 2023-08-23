import { Injectable } from "@nestjs/common";
import { Account, Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { SocialPayload } from "@/user/profile/profile-payloads";

/// AccountWithBans
const accountWithBans = Prisma.validator<Prisma.AccountDefaultArgs>()({
  include: { bans: true },
});
export type AccountWithBans = Prisma.AccountGetPayload<typeof accountWithBans>;

const activeBanCondition = (): Prisma.BanWhereInput => ({
  AND: [
    { type: "ACCESS" },
    {
      OR: [{ expireTimestamp: null }, { expireTimestamp: { gte: new Date() } }],
    },
  ],
});

/// AccountIdAndUUID
const accountIdAndUUID = Prisma.validator<Prisma.AccountDefaultArgs>()({
  select: { id: true, uuid: true },
});
export type AccountIdAndUUID = Prisma.AccountGetPayload<
  typeof accountIdAndUUID
>;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAccountById(id: number): Promise<Account | null> {
    return await this.prisma.account.findUnique({ where: { id } });
  }

  async findAccountByUUID(uuid: string): Promise<Account | null> {
    return await this.prisma.account.findUnique({ where: { uuid } });
  }

  async findAccountIdByUUID(uuid: string): Promise<number> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { uuid },
      select: { id: true },
    });
    return account.id;
  }

  async findAccountIdByUUIDMany(
    uuidArray: string[],
  ): Promise<AccountIdAndUUID[]> {
    const pairs = await this.prisma.account.findMany({
      where: { uuid: { in: uuidArray } },
      select: { id: true, uuid: true },
    });
    return pairs;
  }

  async makeAccountIdToUUIDDictionary(
    uuidArray: string[],
  ): Promise<Map<string, number>> {
    const pairs = await this.findAccountIdByUUIDMany(uuidArray);
    return pairs.reduce(
      (map, e) => map.set(e.uuid, e.id),
      new Map<string, number>(),
    );
  }

  async findOrCreateAccountForAuth(
    authIssuer: number,
    authSubject: string,
  ): Promise<AccountWithBans> {
    const authIssuer_authSubject: Prisma.AccountAuthIssuerAuthSubjectCompoundUniqueInput =
      { authIssuer, authSubject };
    return await this.prisma.account.upsert({
      where: { authIssuer_authSubject },
      update: {},
      create: {
        ...authIssuer_authSubject,
        registrationState: "REGISTERED",
        changedTimestamp: new Date(),
        record: { create: {} },
      },
      include: {
        bans: {
          where: activeBanCondition(),
        },
      },
    });
  }

  async findAccountForAuth(id: number): Promise<AccountWithBans | null> {
    return await this.prisma.account.findUnique({
      where: { id },
      include: {
        bans: {
          where: activeBanCondition(),
        },
      },
    });
  }

  async loadSocialById(id: number): Promise<SocialPayload> {
    const data = await this.prisma.account.findUniqueOrThrow({
      where: { id },
      select: {
        friends: {
          select: {
            friendAccount: { select: { uuid: true } },
            groupName: true,
            activeFlags: true,
          },
        },
        friendReferences: {
          select: {
            account: { select: { uuid: true } },
          },
        },
        enemies: {
          select: {
            enemyAccount: { select: { uuid: true } },
            memo: true,
          },
        },
      },
    });

    const friendList = data.friends.map((e) => ({
      uuid: e.friendAccount.uuid,
      groupName: e.groupName,
      activeFlags: e.activeFlags,
    }));

    const friendUUIDSet = new Set<string>(
      data.friends.map((e) => e.friendAccount.uuid),
    );
    const friendRequestList = data.friendReferences
      .map((e) => e.account.uuid)
      .filter((e) => friendUUIDSet.has(e));

    const enemyList = data.enemies.map((e) => ({
      uuid: e.enemyAccount.uuid,
      memo: e.memo,
    }));

    return { friendList, friendRequestList, enemyList };
  }
}

import { Injectable } from "@nestjs/common";
import { BanType, Prisma, RegistrationState } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

const MIN_TAG_NUMBER = 1000;
const MAX_TAG_NUMBER = 9999;

/// AccountPublic
const accountPublic = Prisma.validator<Prisma.AccountDefaultArgs>()({
  select: { uuid: true, nickName: true, nickTag: true, avatarKey: true },
});
export type AccountPublic = Prisma.AccountGetPayload<typeof accountPublic>;

/// AccountProtected
const accountProtected = Prisma.validator<Prisma.AccountDefaultArgs>()({
  select: {
    ...accountPublic.select,
    activeStatus: true,
    activeTimestamp: true,
    statusMessage: true,
  },
});
export type AccountProtected = Prisma.AccountGetPayload<
  typeof accountProtected
>;

/// AccountPrivate
const accountPrivate = Prisma.validator<Prisma.AccountDefaultArgs>()({
  select: { ...accountProtected.select },
});
export type AccountPrivate = Prisma.AccountGetPayload<typeof accountPrivate>;

/// AccountWithBans
const accountWithBans = Prisma.validator<Prisma.AccountDefaultArgs>()({
  include: { bans: true },
});
export type AccountWithBans = Prisma.AccountGetPayload<typeof accountWithBans>;

const activeBanCondition = (): Prisma.BanWhereInput => ({
  AND: [
    { type: BanType.ACCESS },
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

/// AccountNickNameAndTag
const accountNickNameAndTag = Prisma.validator<Prisma.AccountDefaultArgs>()({
  select: { nickName: true, nickTag: true },
});
export type AccountNickNameAndTag = Prisma.AccountGetPayload<
  typeof accountNickNameAndTag
>;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async isExistsAccountByUUID(uuid: string): Promise<boolean> {
    const account = await this.prisma.account.findUnique({
      where: { uuid },
      select: { uuid: true },
    });
    return account !== null;
  }

  async findAccountPublicByUUID(uuid: string): Promise<AccountPublic | null> {
    return await this.prisma.account.findUnique({
      where: { uuid },
      ...accountPublic,
    });
  }

  async findAccountProtectedByUUID(
    uuid: string,
  ): Promise<AccountProtected | null> {
    return await this.prisma.account.findUnique({
      where: { uuid },
      ...accountProtected,
    });
  }

  async findAccountPrivateByUUID(uuid: string): Promise<AccountPrivate | null> {
    return await this.prisma.account.findUnique({
      where: { uuid },
      ...accountPrivate,
    });
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
      ...accountIdAndUUID,
      where: { uuid: { in: uuidArray } },
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
        registrationState: RegistrationState.REGISTERED,
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

  async findNickByUUID(uuid: string): Promise<AccountNickNameAndTag | null> {
    return await this.prisma.account.findUnique({
      where: { uuid },
      ...accountNickNameAndTag,
    });
  }

  async updateNickByUUID(
    uuid: string,
    name: string,
  ): Promise<AccountNickNameAndTag | undefined> {
    const nickTag: number | undefined = await this.pickRandomTag(name);
    if (nickTag === undefined) {
      return undefined;
    }

    return await this.prisma.account.update({
      where: { uuid },
      data: {
        nickName: name,
        nickTag: nickTag,
      },
      ...accountNickNameAndTag,
    });
  }

  async pickRandomTag(name: string): Promise<number | undefined> {
    //XXX: 작성시 Prisma가 프로시저 호출을 지원하지 않았었음.
    const result = await this.prisma.$queryRaw`
      SELECT "tagNumber"
        FROM generate_series(${MIN_TAG_NUMBER}, ${MAX_TAG_NUMBER}) AS "tagNumber"
        WHERE "tagNumber" NOT IN (
          SELECT "nickTag" FROM services.accounts
          WHERE "nickName" = ${name}
        )
        ORDER BY random()
      LIMIT 1
    `;

    if (!Array.isArray(result) || result.length === 0) {
      return undefined;
    }

    const [{ tagNumber }] = result;
    return Number(tagNumber);
  }

  async findAvatarKeyByUUID(uuid: string): Promise<string | null> {
    const data = await this.prisma.account.findUniqueOrThrow({
      where: { uuid },
    });
    return data.avatarKey;
  }

  async updateAvatarKeyByUUID(
    uuid: string,
    avatarKey: string | null,
  ): Promise<void> {
    const data = await this.prisma.account.update({
      data: { avatarKey },
      where: { uuid },
    });
    void data;
  }

  async findAvatar(key: string): Promise<Buffer> {
    const data = await this.prisma.avatar.findUniqueOrThrow({
      where: { id: key },
    });
    return data.data;
  }

  async createAvatar(avatarData: Buffer): Promise<string> {
    const data = await this.prisma.avatar.create({
      data: { data: avatarData },
    });
    return data.id;
  }

  async updateAvatar(key: string, avatarData: Buffer): Promise<void> {
    const data = await this.prisma.avatar.update({
      data: { data: avatarData },
      where: { id: key },
    });
    void data;
  }

  async deleteAvatar(key: string): Promise<Buffer> {
    const data = await this.prisma.avatar.delete({ where: { id: key } });
    return data.data;
  }
}

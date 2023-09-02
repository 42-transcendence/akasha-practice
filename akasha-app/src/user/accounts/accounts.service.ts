import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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

  async findAccountIdByUUID(uuid: string): Promise<number | null> {
    const account = await this.prisma.account.findUnique({
      where: { uuid },
      select: { id: true },
    });
    return account?.id ?? null;
  }

  async findAccountIdByUUIDOrThrow(uuid: string): Promise<number> {
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

  async updateNickByUUIDAtomic(
    uuid: string,
    name: string,
    tagHint: number | undefined,
    overwrite: boolean,
  ): Promise<AccountNickNameAndTag> {
    const data = await this.prisma.$transaction(async (tx) => {
      // 1. Check Exists Account
      const prev = await tx.account.findUnique({
        where: { uuid },
        select: { nickName: true },
      });
      if (prev === null) {
        throw new NotFoundException("account does not exists");
      }
      if (!overwrite && prev.nickName !== null) {
        throw new BadRequestException("nickName already exists");
      }

      // 2. Pick Random Tag
      //XXX: 작성시 Prisma가 프로시저 호출을 지원하지 않았었음.
      const tagNumberQuery = await tx.$queryRaw`
      SELECT "tagNumber"
        FROM generate_series(${MIN_TAG_NUMBER}, ${MAX_TAG_NUMBER}) AS "tagNumber"
        WHERE "tagNumber" NOT IN (
          SELECT "nickTag" FROM services.accounts
          WHERE "nickName" = ${name}
        )
        ORDER BY "tagNumber" = ${tagHint} DESC, random()
      LIMIT 1
    `;
      if (!Array.isArray(tagNumberQuery) || tagNumberQuery.length === 0) {
        throw new ConflictException(
          `No more tagNumber left for name [${name}]`,
        );
      }
      const [{ tagNumber: tagNumberRaw }] = tagNumberQuery;
      const tagNumber = Number(tagNumberRaw);

      // 3. Update Nick
      return await tx.account.update({
        where: { uuid },
        data: {
          nickName: name,
          nickTag: tagNumber,
        },
        ...accountNickNameAndTag,
      });
    });

    return data;
  }

  async updateAvatarByUUIDAtomic(
    uuid: string,
    avatarData: Buffer | null,
  ): Promise<string | null> {
    const data = await this.prisma.$transaction(async (tx) => {
      // 1. Check Exists Account
      const prev = await tx.account.findUnique({
        where: { uuid },
        select: { avatarKey: true },
      });
      if (prev === null) {
        throw new NotFoundException("account does not exists");
      }

      // 2. Delete Avatar If Exists
      if (prev.avatarKey !== null) {
        const del = await this.prisma.avatar.delete({
          where: { id: prev.avatarKey },
        });
        void del;
      }

      if (avatarData !== null) {
        // 3-A. Insert Updated Avatar
        const ins = await this.prisma.avatar.create({
          data: { data: avatarData },
        });
        const data = await tx.account.update({
          where: { uuid },
          data: { avatarKey: ins.id },
          select: { avatarKey: true },
        });
        return data.avatarKey;
      } else {
        // 3-B. Expect account to have been updated by `ON DELETE SET NULL`
        return null;
      }
    });

    return data;
  }

  async findAvatar(key: string): Promise<Buffer> {
    const data = await this.prisma.avatar.findUniqueOrThrow({
      where: { id: key },
    });
    return data.data;
  }
}

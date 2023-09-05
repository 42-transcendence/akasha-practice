import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ActiveStatus,
  BanCategory,
  Prisma,
  RegistrationState,
} from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { fromBitsString } from "akasha-lib";
import { FRIEND_ACTIVE_FLAGS_SIZE } from "@/_common/chat-payloads";

const MIN_TAG_NUMBER = 1000;
const MAX_TAG_NUMBER = 9999;

/// AccountPublic
const accountPublic = Prisma.validator<Prisma.AccountDefaultArgs>()({
  select: { id: true, nickName: true, nickTag: true, avatarKey: true },
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

/// AccountForAuth
const accountForAuth = Prisma.validator<Prisma.AccountDefaultArgs>()({
  include: { otpSecret: true, bans: true },
});
export type AccountForAuth = Prisma.AccountGetPayload<typeof accountForAuth>;

const activeBanCondition = (): Prisma.BanWhereInput => ({
  AND: [
    { category: BanCategory.ACCESS },
    {
      OR: [{ expireTimestamp: null }, { expireTimestamp: { gte: new Date() } }],
    },
  ],
});

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

  async isAvailableAccount(id: string): Promise<boolean> {
    const account = await this.prisma.account.findUnique({
      where: { id },
      select: { nickName: true },
    });
    return account !== null && account.nickName !== null;
  }

  async findAccountPublic(id: string): Promise<AccountPublic | null> {
    return await this.prisma.account.findUnique({
      where: { id },
      ...accountPublic,
    });
  }

  async findAccountProtected(id: string): Promise<AccountProtected | null> {
    return await this.prisma.account.findUnique({
      where: { id },
      ...accountProtected,
    });
  }

  async findAccountPrivate(id: string): Promise<AccountPrivate | null> {
    return await this.prisma.account.findUnique({
      where: { id },
      ...accountPrivate,
    });
  }

  async findOrCreateAccountForAuth(
    authIssuer: number,
    authSubject: string,
  ): Promise<AccountForAuth> {
    const authIssuer_authSubject: Prisma.AccountAuthIssuerAuthSubjectCompoundUniqueInput =
      { authIssuer, authSubject };
    return await this.prisma.account.upsert({
      where: { authIssuer_authSubject },
      update: {},
      create: {
        ...authIssuer_authSubject,
        registrationState: RegistrationState.REGISTERED,
        changedTimestamp: new Date(),
        activeStatus: ActiveStatus.ONLINE,
        activeTimestamp: new Date(),
        record: { create: { skillRating: 500 } }, //FIXME: Magic Number
      },
      include: {
        otpSecret: true,
        bans: {
          where: activeBanCondition(),
        },
      },
    });
  }

  async findAccountForAuth(id: string): Promise<AccountForAuth> {
    return await this.prisma.account.findUniqueOrThrow({
      where: { id },
      include: {
        otpSecret: true,
        bans: {
          where: activeBanCondition(),
        },
      },
    });
  }

  async findActiveStatus(id: string): Promise<ActiveStatus> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id },
      select: { activeStatus: true },
    });
    return account?.activeStatus;
  }

  async updateActiveStatus(
    id: string,
    activeStatus: ActiveStatus,
  ): Promise<void> {
    const account = await this.prisma.account.update({
      where: { id },
      data: { activeStatus },
    });
    void account;
  }

  async updateActiveTimestamp(
    id: string,
    except?: ActiveStatus | undefined,
  ): Promise<void> {
    //XXX: Conditional Update
    const batch = await this.prisma.account.updateMany({
      where: {
        id,
        activeStatus: { not: { equals: except } },
      },
      data: { activeTimestamp: new Date() },
    });
    void batch;
  }

  async findFriendActiveFlags(
    id: string,
    friendId: string,
  ): Promise<number | null> {
    const friendReverse = await this.prisma.friend.findUnique({
      where: {
        accountId_friendAccountId: {
          accountId: friendId,
          friendAccountId: id,
        },
      },
      select: {
        activeFlags: true,
      },
    });
    if (friendReverse === null) {
      return null;
    }

    return fromBitsString(friendReverse.activeFlags, FRIEND_ACTIVE_FLAGS_SIZE);
  }

  async updateNickAtomic(
    id: string,
    name: string,
    tagHint: number | undefined,
    overwrite: boolean,
  ): Promise<AccountNickNameAndTag> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Check Exists Account
      const prev = await tx.account.findUnique({
        where: { id },
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
        where: { id },
        data: {
          nickName: name,
          nickTag: tagNumber,
        },
        ...accountNickNameAndTag,
      });
    });
  }

  async updateAvatarAtomic(
    id: string,
    avatarData: Buffer | null,
  ): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Check Exists Account
      const prev = await tx.account.findUnique({
        where: { id },
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
          where: { id },
          data: { avatarKey: ins.id },
          select: { avatarKey: true },
        });
        return data.avatarKey;
      } else {
        // 3-B. Expect account to have been updated by `ON DELETE SET NULL`
        return null;
      }
    });
  }

  async findAvatar(key: string): Promise<Buffer> {
    const avatar = await this.prisma.avatar.findUniqueOrThrow({
      where: { id: key },
    });
    return avatar.data;
  }
}

import { Injectable } from "@nestjs/common";
import { Account, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

const accountWithRecord = Prisma.validator<Prisma.AccountDefaultArgs>()({
  include: { record: true },
});
type AccountWithRecord = Prisma.AccountGetPayload<typeof accountWithRecord>;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateAccountForAuth(
    authIssuer_authSubject: Prisma.AccountAuthIssuerAuthSubjectCompoundUniqueInput,
  ): Promise<Account> {
    return await this.prisma.account.upsert({
      where: { authIssuer_authSubject },
      update: {},
      create: {
        ...authIssuer_authSubject,
        registrationState: "REGISTERED",
        changedTimestamp: new Date(),
        record: { create: {} },
      },
    });
  }

  async getAccount(id: number): Promise<Account | null> {
    return await this.prisma.account.findUnique({ where: { id } });
  }

  async getAccountForUUID(uuid: string): Promise<Account> {
    return await this.prisma.account.findUniqueOrThrow({ where: { uuid } });
  }

  async getAccountWithRecordForUUID(uuid: string): Promise<AccountWithRecord> {
    return await this.prisma.account.findUniqueOrThrow({
      where: { uuid },
      include: { record: true },
    });
  }
}

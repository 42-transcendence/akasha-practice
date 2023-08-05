import { Injectable } from "@nestjs/common";
import { Authorization, Prisma, Session } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNewTemporaryState(
    data: Prisma.AuthorizationCreateInput,
  ): Promise<Authorization> {
    return await this.prisma.authorization.create({ data });
  }

  async findAndDeleteTemporaryState(
    id: string,
  ): Promise<Authorization | undefined> {
    try {
      return await this.prisma.authorization.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          // An operation failed because it depends on one or more records that were required but not found. {cause}
          return undefined;
        }
      }
      throw e;
    }
  }

  async createNewSession(accountId: number): Promise<Session> {
    return await this.prisma.session.create({
      data: { accountId, isValid: true },
    });
  }
}

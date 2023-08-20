import { PrismaService } from "@/prisma/prisma.service";
import { Injectable } from "@nestjs/common";
import { ChatRoomEntry } from "./chat-payloads";

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async loadOwnRoomListByAccountId(
    accountId: number,
  ): Promise<ChatRoomEntry[]> {
    const data = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        chatRooms: {
          select: {
            chat: {
              select: {
                uuid: true,
                members: {
                  select: {
                    account: { select: { uuid: true } },
                    modeFlags: true,
                  },
                },
              },
            },
            modeFlags: true,
            lastMessageId: true,
          },
        },
      },
    });

    return data.chatRooms.map((e) => ({
      uuid: e.chat.uuid,
      modeFlags: e.modeFlags,
      members: e.chat.members.map((e) => ({
        uuid: e.account.uuid,
        modeFlags: e.modeFlags,
      })),
      lastMessageId: e.lastMessageId,
    }));
  }
}

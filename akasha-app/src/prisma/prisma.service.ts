import { ChatRoomModeFlags } from "@common/chat-payloads";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private static extend(client: PrismaClient) {
    return client.$extends({
      result: {
        chat: {
          isPrivate: {
            needs: { modeFlags: true },
            compute(chat): boolean {
              return (chat.modeFlags & ChatRoomModeFlags.PRIVATE) !== 0;
            },
          },
          isSecret: {
            needs: { modeFlags: true },
            compute(chat): boolean {
              return (chat.modeFlags & ChatRoomModeFlags.SECRET) !== 0;
            },
          },
        },
      },
    });
  }

  private _backing_x!: ReturnType<typeof PrismaService.extend>;

  async onModuleInit() {
    this._backing_x = PrismaService.extend(this);
    await this._backing_x.$connect();
  }

  get x(): typeof this._backing_x {
    return this._backing_x;
  }
}

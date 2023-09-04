import { ChatRoomModeFlags } from "@common/chat-payloads";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

export type PrismaX = ReturnType<typeof extend>;

function extend(client: PrismaClient) {
  return client.$extends({
    result: {
      chat: {
        modeFlags: {
          needs: { isPrivate: true, isSecret: true },
          compute(chat): number {
            return (
              (chat.isPrivate ? ChatRoomModeFlags.PRIVATE : 0) |
              (chat.isSecret ? ChatRoomModeFlags.SECRET : 0)
            );
          },
        },
      },
    },
  });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private _backing_x!: PrismaX;

  async onModuleInit() {
    this._backing_x = extend(this);
    await this._backing_x.$connect();
  }

  get x(): typeof this._backing_x {
    return this._backing_x;
  }
}

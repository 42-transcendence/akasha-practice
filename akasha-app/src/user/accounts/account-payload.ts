import {
  AccountEntity,
  BanTypeNumber,
  EnemyEntity,
  FriendEntity,
  getBanTypeNumber,
} from "@/generated/types";
import { Ban } from "@prisma/client";

export type AccountUUID = Pick<AccountEntity, "uuid">;

export type BanSummaryPayload = {
  type: BanTypeNumber;
  reason: string;
  expireTimestamp: Date | null;
};

export function banToSummaryPayload(banList: Ban[]): BanSummaryPayload[] {
  return banList.map((e) => ({
    type: getBanTypeNumber(e.type),
    reason: e.reason,
    expireTimestamp: e.expireTimestamp,
  }));
}

export type FriendEntry = AccountUUID &
  Pick<FriendEntity, "groupName" | "activeFlags">;

export type EnemyEntry = AccountUUID & Pick<EnemyEntity, "memo">;

export type SocialPayload = {
  friendList: FriendEntry[];
  friendRequestList: string[];
  enemyList: EnemyEntry[];
};

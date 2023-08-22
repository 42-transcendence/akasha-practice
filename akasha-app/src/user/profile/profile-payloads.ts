import {
  AccountEntity,
  BanTypeNumber,
  EnemyEntity,
  FriendEntity,
} from "@/generated/types";
import { initProperties } from "akasha-lib";

/// AccountUUID
export type AccountUUID = Pick<AccountEntity, "uuid">;

/// AccountProfilePublicPayload
export type AccountProfilePublicPayload = Pick<
  AccountEntity,
  "uuid" | "nickName" | "nickTag" | "avatarKey"
>;

export class AccountProfilePublicModel implements AccountProfilePublicPayload {
  uuid: string = undefined!;
  nickName: string | null = undefined!;
  nickTag: number = undefined!;
  avatarKey: string | null = undefined!;

  constructor(payload: AccountProfilePublicPayload) {
    initProperties<AccountProfilePublicModel>(this, payload);
  }
}

/// AccountProfileProtectedPayload
export type AccountProfileProtectedPayload = Pick<
  AccountEntity,
  "uuid" | "activeStatus" | "activeTimestamp" | "statusMessage"
>;

/// BanSummaryPayload
export type BanSummaryPayload = {
  type: BanTypeNumber;
  reason: string;
  expireTimestamp: Date | null;
};

/// FriendEntry
export type FriendEntry = AccountUUID &
  Pick<FriendEntity, "groupName" | "activeFlags">;

/// EnemyEntry
export type EnemyEntry = AccountUUID & Pick<EnemyEntity, "memo">;

/// SocialPayload
export type SocialPayload = {
  friendList: FriendEntry[];
  friendRequestList: string[];
  enemyList: EnemyEntry[];
};

import {
  AccountEntity,
  ActiveStatusNumber,
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
export type AccountProfileProtectedPayload = AccountProfilePublicPayload &
  Pick<AccountEntity, "activeStatus" | "activeTimestamp" | "statusMessage">;

export class AccountProfileProtectedModel
  implements AccountProfileProtectedPayload
{
  uuid: string = undefined!;
  nickName: string | null = undefined!;
  nickTag: number = undefined!;
  avatarKey: string | null = undefined!;
  activeStatus: ActiveStatusNumber = undefined!;
  activeTimestamp: Date = undefined!;
  statusMessage: string = undefined!;

  constructor(payload: AccountProfileProtectedPayload) {
    initProperties<AccountProfileProtectedModel>(this, payload);
  }
}

/// AccountProfilePrivatePayload
export type AccountProfilePrivatePayload = AccountProfileProtectedPayload;

export class AccountProfilePrivateModel
  implements AccountProfilePrivatePayload
{
  uuid: string = undefined!;
  nickName: string | null = undefined!;
  nickTag: number = undefined!;
  avatarKey: string | null = undefined!;
  activeStatus: ActiveStatusNumber = undefined!;
  activeTimestamp: Date = undefined!;
  statusMessage: string = undefined!;

  constructor(payload: AccountProfilePrivatePayload) {
    initProperties<AccountProfilePrivateModel>(this, payload);
  }
}

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

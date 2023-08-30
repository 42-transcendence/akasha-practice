import { AccountEntity, BanTypeNumber } from "./generated/types";

/// AccountUUID
export type AccountUUID = Pick<AccountEntity, "uuid">;

/// AccountProfilePublicPayload
export type AccountProfilePublicPayload = Pick<
  AccountEntity,
  "uuid" | "nickName" | "nickTag" | "avatarKey"
>;

/// AccountProfileProtectedPayload
export type AccountProfileProtectedPayload = AccountProfilePublicPayload &
  Pick<AccountEntity, "activeStatus" | "activeTimestamp" | "statusMessage">;

/// AccountProfilePrivatePayload
export type AccountProfilePrivatePayload = AccountProfileProtectedPayload;

/// BanSummaryPayload
export type BanSummaryPayload = {
  type: BanTypeNumber;
  reason: string;
  expireTimestamp: Date | null;
};

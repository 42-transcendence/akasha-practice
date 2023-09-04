import { AccountEntity, BanCategoryNumber } from "./generated/types";

/// AccountProfilePublicPayload
export type AccountProfilePublicPayload = Pick<
  AccountEntity,
  "id" | "nickName" | "nickTag" | "avatarKey"
>;

/// AccountProfileProtectedPayload
export type AccountProfileProtectedPayload = AccountProfilePublicPayload &
  Pick<AccountEntity, "activeStatus" | "activeTimestamp" | "statusMessage">;

/// AccountProfilePrivatePayload
export type AccountProfilePrivatePayload = AccountProfileProtectedPayload;

/// BanSummaryPayload
export type BanSummaryPayload = {
  category: BanCategoryNumber;
  reason: string;
  expireTimestamp: Date | null;
};

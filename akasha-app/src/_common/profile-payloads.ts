import { AccountEntity, BanCategoryNumber, BanEntity } from "./generated/types";

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
export type BanSummaryPayload = Pick<
  BanEntity,
  "category" | "reason" | "expireTimestamp"
> & {
  category: BanCategoryNumber;
};

import { NICK_NAME_REGEX } from "@common/profile-constants";
import { IsString, Matches } from "class-validator";

/// NickNameModel
export class NickNameModel {
  @IsString() @Matches(NICK_NAME_REGEX) readonly name;

  constructor(name: string) {
    this.name = name;
  }
}

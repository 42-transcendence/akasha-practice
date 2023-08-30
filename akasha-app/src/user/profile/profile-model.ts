import { IsString } from "class-validator";

/// NickNameModel
export class NickNameModel {
  @IsString() readonly name;

  constructor(name: string) {
    this.name = name;
  }
}

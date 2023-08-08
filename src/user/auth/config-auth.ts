import { JWTOptions } from "@libs/jwt";
import { OAuth } from "@libs/oauth";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
  isArray,
  isString,
} from "class-validator";
import { patternToRegExp } from "@libs/regex";
import { encodeUTF8 } from "@libs/utf8";

export class AuthSource {
  @IsNumber() key: number;
  @IsUrl() auth_url: string;
  @IsUrl() token_url: string;
  @IsUrl() @IsOptional() jwks_url?: string | undefined;
  @IsString() client_id: string;
  @IsString() client_secret: string;
  @IsArray() @IsString({ each: true }) scope: string[];
  @IsBoolean() openid: boolean;
  @IsUrl() @IsOptional() subject_url?: string | undefined;
  @IsString() @IsOptional() subject_key?: string | undefined;

  _oauth: OAuth;
}

export class AuthJWTOptions implements JWTOptions {
  @IsString() @IsOptional() issuer?: string | undefined;
  @IsString() @IsOptional() subject?: string | undefined;
  @IsString() @IsOptional() audience?: string | undefined;
}

export class AuthConfiguration {
  @Transform(({ value }) =>
    isArray(value)
      ? value.map((e) => (isString(e) ? patternToRegExp(e, "i") : undefined))
      : undefined,
  )
  @IsArray()
  @IsDefined({ each: true })
  redirect_uri: RegExp[];

  @Type(() => AuthSource)
  @IsObject()
  @ValidateNested()
  source: Map<string, AuthSource>;

  @Transform(({ value }) => (isString(value) ? encodeUTF8(value) : undefined))
  @IsDefined()
  jwt_secret: Uint8Array;

  @IsNumber()
  jwt_expire_secs: number;

  @Type(() => AuthJWTOptions)
  @IsObject()
  @ValidateNested()
  jwt_options: AuthJWTOptions;
}

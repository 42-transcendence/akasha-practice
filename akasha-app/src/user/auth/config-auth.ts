import { JWTOptions } from "@libs/jwt";
import { OAuth } from "@libs/oauth";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from "class-validator";

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
  @IsArray() @IsString({ each: true }) redirect_uri: string[];

  @Type(() => AuthSource)
  @IsObject()
  @ValidateNested()
  source: Map<string, AuthSource>;

  @IsString() jwt_secret: string;

  @IsNumber() jwt_expire_secs: number;

  @Type(() => AuthJWTOptions)
  @IsObject()
  @ValidateNested()
  jwt_options: AuthJWTOptions;

  _jwt_secret: Uint8Array;
}

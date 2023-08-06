import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from "class-validator";

export class AuthConfiguration {
  @IsArray() @IsString({ each: true }) redirect_uri: string[];
  @Type(() => AuthSource) @ValidateNested() source: Map<string, AuthSource>;
}

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
}

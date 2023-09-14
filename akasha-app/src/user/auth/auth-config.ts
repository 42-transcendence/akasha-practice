import { JWTHashAlgorithm, JWTOptions, assert } from "akasha-lib";
import { OAuth } from "akasha-lib";
import { Transform, Type, plainToClass } from "class-transformer";
import {
  Equals,
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
  validateSync,
} from "class-validator";
import { patternToRegExp } from "akasha-lib";
import { encodeUTF8 } from "akasha-lib";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";

export class AuthSource {
  @IsNumber() key!: number;
  @IsUrl() auth_url!: string;
  @IsUrl() token_url!: string;
  @IsUrl() @IsOptional() jwks_url?: string | undefined;
  @IsString() client_id!: string;
  @IsString() client_secret!: string;
  @IsArray() @IsString({ each: true }) scope!: string[];
  @IsBoolean() openid!: boolean;
  @IsUrl() @IsOptional() subject_url?: string | undefined;
  @IsString() @IsOptional() subject_key?: string | undefined;

  @Equals(undefined) _oauth: OAuth | undefined = undefined;

  get oauth(): OAuth {
    assert(this._oauth !== undefined);
    return this._oauth;
  }
}

export class AuthJWTOptions implements JWTOptions {
  @IsString() @IsOptional() issuer?: string | undefined;
  @IsString() @IsOptional() subject?: string | undefined;
  @IsString() @IsOptional() audience?: string | undefined;
}

export class AuthConfiguration {
  protected static readonly logger = new Logger(AuthConfiguration.name);
  static readonly JWT_ALGORITHM: JWTHashAlgorithm = "HS256";

  static load(env: ConfigService) {
    const config = plainToClass(AuthConfiguration, env.get("auth"));
    const validationErrrors = validateSync(config, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (validationErrrors.length !== 0) {
      for (const validationError of validationErrrors) {
        AuthConfiguration.logger.error(validationError.toString());
      }
      throw new Error("Validation error");
    }
    return config;
  }

  @Transform(({ value }) =>
    isArray(value)
      ? value.map((e) => (isString(e) ? patternToRegExp(e, "i") : undefined))
      : undefined,
  )
  @IsArray()
  @IsDefined({ each: true })
  redirect_uri!: RegExp[];

  @Type(() => AuthSource)
  @IsObject()
  @ValidateNested()
  source!: Map<string, AuthSource>;

  @Transform(({ value }) => (isString(value) ? encodeUTF8(value) : undefined))
  @IsDefined()
  jwt_secret!: Uint8Array;

  @IsNumber()
  jwt_temp_expire_secs!: number;

  @IsNumber()
  jwt_expire_secs!: number;

  @Type(() => AuthJWTOptions)
  @IsObject()
  @ValidateNested()
  jwt_options!: AuthJWTOptions;
}

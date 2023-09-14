import { JWTHashAlgorithm, JWTOptions } from "akasha-lib";
import { Transform, Type, plainToClass } from "class-transformer";
import {
  IsDefined,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
  isString,
  validateSync,
} from "class-validator";
import { encodeUTF8 } from "akasha-lib";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";

export class GameJWTOptions implements JWTOptions {
  @IsString() @IsOptional() issuer?: string | undefined;
  @IsString() @IsOptional() subject?: string | undefined;
  @IsString() @IsOptional() audience?: string | undefined;
}

export class GameConfiguration {
  protected static readonly logger = new Logger(GameConfiguration.name);
  static readonly JWT_ALGORITHM: JWTHashAlgorithm = "HS256";

  static load(env: ConfigService) {
    const config = plainToClass(GameConfiguration, env.get("game"));
    const validationErrrors = validateSync(config, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (validationErrrors.length !== 0) {
      for (const validationError of validationErrrors) {
        GameConfiguration.logger.error(validationError.toString());
      }
      throw new Error("Validation error");
    }
    return config;
  }

  @IsString() unique_id!: string;

  @Transform(({ value }) => (isString(value) ? encodeUTF8(value) : undefined))
  @IsDefined()
  jwt_secret!: Uint8Array;

  @IsNumber()
  jwt_expire_secs!: number;

  @Type(() => GameJWTOptions)
  @IsObject()
  @ValidateNested()
  jwt_options!: GameJWTOptions;
}

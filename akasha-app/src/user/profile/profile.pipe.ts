import { NICK_NAME_REGEX } from "@/_common/profile-constants";
import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from "@nestjs/common";

@Injectable()
export class NickNamePipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    void metadata;
    if (value === undefined) {
      throw new BadRequestException("Undefined value");
    }
    if (!NICK_NAME_REGEX.test(value)) {
      throw new BadRequestException("Invalid NickName");
    }
    return value;
  }
}

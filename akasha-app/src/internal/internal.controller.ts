import {
  Controller,
  Get,
  Header,
  Param,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { AVATAR_MIME_TYPE } from "@common/profile-constants";
import { InternalService } from "./internal.service";
import { InternalGuard } from "./internal.guard";

@Controller("internal")
@UseGuards(InternalGuard)
export class InternalController {
  constructor(private readonly service: InternalService) {}

  @Get("raw-avatar/:key")
  @Header("Content-Type", AVATAR_MIME_TYPE)
  @Header("Content-Disposition", "inline")
  //TODO: Cache-Control
  async getAvatarByKey(@Param("key") key: string) {
    const data = await this.service.getAvatarData(key);
    return new StreamableFile(data);
  }
}

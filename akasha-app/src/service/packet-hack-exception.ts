import { WsException } from "@nestjs/websockets";

export class PacketHackException extends WsException {
  override get name() {
    return "PacketHackException";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

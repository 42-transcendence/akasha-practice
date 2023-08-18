import { IncomingMessage } from "http";
import { OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import { ServiceWebSocketBase } from "./service-socket";

export class ServiceGatewayBase
  implements OnGatewayConnection, OnGatewayDisconnect
{
  handleConnection(client: ServiceWebSocketBase, arg: IncomingMessage) {
    client.onConnection(arg);
  }

  handleDisconnect(client: ServiceWebSocketBase) {
    client.onDisconnect();
  }
}

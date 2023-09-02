import { IncomingMessage } from "http";
import { Logger, UseFilters } from "@nestjs/common";
import { OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import { ServiceWebSocketBase } from "./service-socket";
import { WsServiceExceptionsFilter } from "./ws-service-exception.filter";

@UseFilters(WsServiceExceptionsFilter)
export abstract class ServiceGatewayBase<T extends ServiceWebSocketBase>
  implements OnGatewayConnection, OnGatewayDisconnect
{
  handleConnection(client: T, arg: IncomingMessage): void {
    try {
      client.onConnection(arg);

      this.handleServiceConnection(client, arg);
    } catch (e) {
      //XXX: NestJS가 OnGatewayConnection에서 발생하는 오류를 이벤트 루프에 도달할 때까지 잡지 않음.
      Logger.error(`OnConnection: ${e}`, "UnhandledWebSocketError");
      client.terminate();
    }
  }

  abstract handleServiceConnection(client: T, arg: IncomingMessage): void;

  handleDisconnect(client: T): void {
    try {
      client.onDisconnect();

      this.handleServiceDisconnect(client);
    } catch (e) {
      //XXX: NestJS가 OnGatewayDisconnect에서 발생하는 오류를 이벤트 루프에 도달할 때까지 잡지 않음.
      Logger.error(`OnDisconnect: ${e}`, "UnhandledWebSocketError");
    }
  }

  abstract handleServiceDisconnect(client: T): void;
}

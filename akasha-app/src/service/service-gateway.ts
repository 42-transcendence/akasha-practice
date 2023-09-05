import { IncomingMessage } from "http";
import { Logger, UseFilters } from "@nestjs/common";
import { OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import { ServiceWebSocketBase } from "./service-socket";
import { WsServiceExceptionsFilter } from "./ws-service-exception.filter";

@UseFilters(WsServiceExceptionsFilter)
export abstract class ServiceGatewayBase<T extends ServiceWebSocketBase>
  implements OnGatewayConnection, OnGatewayDisconnect
{
  async handleConnection(client: T, arg: IncomingMessage): Promise<void> {
    try {
      client.onConnection(arg);

      await this.handleServiceConnection(client, arg);
    } catch (e) {
      //XXX: NestJS가 OnGatewayConnection에서 발생하는 오류를 이벤트 루프에 도달할 때까지 잡지 않음.
      if (e instanceof Error) {
        Logger.error(
          `OnConnection: ${e.name}: ${e.message}: ${e.stack}`,
          "UnhandledWebSocketError",
        );
      } else {
        Logger.error(`OnConnection: ${e}`, "UnhandledWebSocketError");
      }
      client.terminate();
    }
  }

  abstract handleServiceConnection(
    client: T,
    arg: IncomingMessage,
  ): Promise<void>;

  async handleDisconnect(client: T): Promise<void> {
    try {
      client.onDisconnect();

      await this.handleServiceDisconnect(client);
    } catch (e) {
      //XXX: NestJS가 OnGatewayDisconnect에서 발생하는 오류를 이벤트 루프에 도달할 때까지 잡지 않음.
      if (e instanceof Error) {
        Logger.error(
          `OnDisconnect: ${e.name}: ${e.message}: ${e.stack}`,
          "UnhandledWebSocketError",
        );
      } else {
        Logger.error(`OnDisconnect: ${e}`, "UnhandledWebSocketError");
      }
    }
  }

  abstract handleServiceDisconnect(client: T): Promise<void>;
}

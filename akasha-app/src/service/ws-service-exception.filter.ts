import { Catch, ArgumentsHost, Logger } from "@nestjs/common";
import { WsArgumentsHost } from "@nestjs/common/interfaces";
import { BaseWsExceptionFilter } from "@nestjs/websockets";
import { ServiceWebSocketBase } from "./service-socket";

@Catch()
export class WsServiceExceptionsFilter extends BaseWsExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    // super.catch(exception, host);
    const ws: WsArgumentsHost = host.switchToWs();
    const client = ws.getClient<ServiceWebSocketBase>();
    if (exception instanceof Error) {
      Logger.debug(
        `Exception ServiceWebSocket[${client.remoteAddress} -> ${client.remoteURL}]: ${exception.name}: ${exception.message}: ${exception.stack}`,
      );
    } else {
      Logger.debug(
        `Exception ServiceWebSocket[${client.remoteAddress} -> ${client.remoteURL}]: ${exception}`,
      );
    }
    if (client.isIllegalException(exception)) {
      client.terminate();
    }
  }
}

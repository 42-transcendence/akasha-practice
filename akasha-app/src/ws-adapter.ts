import { INestApplicationContext, Logger } from "@nestjs/common";
import { normalizePath, isNil } from "@nestjs/common/utils/shared.utils";
import { AbstractWsAdapter, GatewayMetadata } from "@nestjs/websockets";
import {
  CLOSE_EVENT,
  CONNECTION_EVENT,
  ERROR_EVENT,
} from "@nestjs/websockets/constants";
import { MessageMappingProperties } from "@nestjs/websockets/gateway-metadata-explorer";
import * as http from "http";
import { ByteBuffer } from "@libs/byte-buffer";
import { EMPTY, fromEvent, Observable } from "rxjs";
import { filter, first, mergeMap, share, takeUntil } from "rxjs/operators";
import { WebSocketServer, WebSocket } from "ws";

enum WsReadyState {
  CONNECTING = WebSocket.CONNECTING,
  OPEN = WebSocket.OPEN,
  CLOSING = WebSocket.CLOSING,
  CLOSED = WebSocket.CLOSED,
}

type WsServer = WebSocketServer;
type WsClient = WebSocket;
type WsOption = GatewayMetadata;

type WsRawPayload = Uint8Array;
type WsRequestPayload = ByteBuffer;
type WsResponsePayload = ByteBuffer;

type HttpServerRegistryKey = number;
type HttpServerRegistryEntry = http.Server;
type WsServerRegistryKey = number;
type WsServerRegistryEntry = WsServer[];

const UNDERLYING_HTTP_SERVER_PORT = 0;

/**
 * @publicApi
 */
export class WsAdapter extends AbstractWsAdapter {
  protected readonly logger = new Logger(WsAdapter.name);
  protected readonly httpServersRegistry = new Map<
    HttpServerRegistryKey,
    HttpServerRegistryEntry
  >();
  protected readonly wsServersRegistry = new Map<
    WsServerRegistryKey,
    WsServerRegistryEntry
  >();

  constructor(appOrHttpServer?: INestApplicationContext | any) {
    super(appOrHttpServer);
  }

  public override create(port: number, options?: WsOption): WsServer {
    const { path, ...wsOptions } = options ?? {};

    if (port === UNDERLYING_HTTP_SERVER_PORT && this.httpServer) {
      this.ensureHttpServerExists(port, this.httpServer);
      const wsServer = this.bindErrorHandler(
        new WebSocketServer({
          noServer: true,
          ...wsOptions,
        }),
      );

      this.addWsServerToRegistry(wsServer, port, path ?? "");
      return wsServer;
    }

    if (path && port !== UNDERLYING_HTTP_SERVER_PORT) {
      // Multiple servers with different paths
      // sharing a single HTTP/S server running on different port
      // than a regular HTTP application
      const httpServer = this.ensureHttpServerExists(port);
      httpServer?.listen(port);

      const wsServer = this.bindErrorHandler(
        new WebSocketServer({
          noServer: true,
          ...wsOptions,
        }),
      );
      this.addWsServerToRegistry(wsServer, port, path);
      return wsServer;
    }
    const wsServer = this.bindErrorHandler(
      new WebSocketServer({
        port,
        path,
        ...wsOptions,
      }),
    );
    return wsServer;
  }

  public override bindMessageHandlers(
    client: WsClient,
    handlers: MessageMappingProperties[],
    transform: (data: any) => Observable<any>,
  ) {
    const close$ = fromEvent(client, CLOSE_EVENT).pipe(share(), first());
    const source$ = fromEvent(client, "message").pipe(
      mergeMap((data) =>
        this.bindMessageHandler(data, handlers, transform).pipe(
          filter((result) => !isNil(result)),
        ),
      ),
      takeUntil(close$),
    );
    const onMessage = (response: unknown) => {
      if (client.readyState !== WsReadyState.OPEN) {
        return;
      }
      // WsResponsePayload
      if (response instanceof ByteBuffer) {
        const message: WsResponsePayload = response;
        const data: WsRawPayload = message.toArray(); // Transform
        client.send(data);
      } else {
        throw new TypeError("Unknown WebSocket response type");
      }
    };
    source$.subscribe(onMessage);
  }

  public bindMessageHandler(
    buffer: unknown,
    handlers: MessageMappingProperties[],
    transform: (data: any) => Observable<any>,
  ): Observable<unknown> {
    try {
      if (
        !(buffer !== null && typeof buffer === "object" && "data" in buffer)
      ) {
        throw undefined;
      }
      if (!(buffer.data instanceof Uint8Array)) {
        // not WsRawPayload
        throw undefined;
      }
      const data: WsRawPayload = buffer.data;
      const request: WsRequestPayload = ByteBuffer.from(data); // Transform
      const message = request.readOpcode();
      const messageHandler = handlers.find(
        (handler) => handler.message === message,
      );
      if (!messageHandler) {
        throw undefined;
      }
      const { callback } = messageHandler;
      return transform(callback(request));
    } catch {
      return EMPTY;
    }
  }

  public bindErrorHandler(server: WsServer) {
    server.on(CONNECTION_EVENT, (ws: WsClient) =>
      ws.on(ERROR_EVENT, (err: Error) => this.logger.error(err)),
    );
    server.on(ERROR_EVENT, (err: Error) => this.logger.error(err));
    return server;
  }

  public override bindClientDisconnect(
    client: WsClient,
    callback: (this: WsClient, code: number, reason: Buffer) => void,
  ) {
    client.on(CLOSE_EVENT, callback);
  }

  public override async dispose() {
    const closeEventSignals = Array.from(this.httpServersRegistry)
      .filter(([port]) => port !== UNDERLYING_HTTP_SERVER_PORT)
      .map(([, server]) => new Promise((resolve) => server.close(resolve)));

    await Promise.all(closeEventSignals);
    this.httpServersRegistry.clear();
    this.wsServersRegistry.clear();
  }

  protected ensureHttpServerExists(
    port: number,
    httpServer = http.createServer(),
  ) {
    if (this.httpServersRegistry.has(port)) {
      return;
    }
    this.httpServersRegistry.set(port, httpServer);

    httpServer.on("upgrade", (request, socket, head) => {
      const baseUrl = "ws://" + request.headers.host + "/";
      const pathname = new URL(request.url ?? "", baseUrl).pathname;
      const wsServersCollection = this.wsServersRegistry.get(port) ?? [];

      let isRequestDelegated = false;
      for (const wsServer of wsServersCollection) {
        if (pathname === wsServer.path) {
          wsServer.handleUpgrade(request, socket, head, (ws: unknown) => {
            wsServer.emit("connection", ws, request);
          });
          isRequestDelegated = true;
          break;
        }
      }
      if (!isRequestDelegated) {
        socket.destroy();
      }
    });
    return httpServer;
  }

  protected addWsServerToRegistry(
    wsServer: WsServer,
    port: number,
    path: string,
  ) {
    const entries = this.wsServersRegistry.get(port) ?? [];
    entries.push(wsServer);

    wsServer.path = normalizePath(path);
    this.wsServersRegistry.set(port, entries);
  }
}

"use client";

import { ByteBuffer } from "@akasha-lib";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { WebSocketRegistry, SocketStateNumber } from "./websocket-registry";
import type {
  SocketState,
  WebSocketListenProps,
  WebSocketRegisterProps,
} from "./websocket-registry";

const RegistryContext = createContext(WebSocketRegistry.DEFAULT);

export function WebSocketRegistryContainer({
  children,
}: React.PropsWithChildren) {
  const registry = useMemo(() => new WebSocketRegistry(), []);
  return (
    <RegistryContext.Provider value={registry}>
      {children}
    </RegistryContext.Provider>
  );
}

export function useWebSocketConnector(props: WebSocketRegisterProps) {
  const registry: WebSocketRegistry = useContext(RegistryContext);
  useEffect(() => registry.register(props), [registry, props]);
}

type ResponsePayload = ByteBuffer | ByteBuffer[] | undefined | void;

export function useWebSocket(
  name: string,
  opcode?: number | number[] | undefined,
  once?:
    | ((
        opcode: number,
        buffer: ByteBuffer
      ) => ResponsePayload | Promise<ResponsePayload>)
    | undefined
): {
  dangerouslyGetWebSocketRef: React.MutableRefObject<WebSocket | undefined>;
  socketState: SocketState;
  lastOpcode: number | undefined;
  lastPayload: ByteBuffer | undefined;
  sendPayload: (value: ByteBuffer) => void;
} {
  const registry: WebSocketRegistry = useContext(RegistryContext);
  const webSocketRef = useRef<WebSocket>();
  const [socketState, setSocketState] = useState<SocketState>({
    number: SocketStateNumber.INITIAL,
  });
  const [lastMessage, setLastMessage] = useState<ArrayBuffer>();
  const sendPayload = useCallback((value: ByteBuffer): void => {
    webSocketRef.current?.send(value.toArray());
  }, []);
  const opcodeRef = useRef<typeof opcode>();
  useEffect(() => {
    opcodeRef.current = opcode;
  }, [opcode]);
  useEffect(() => {
    const opcode = opcodeRef.current;
    const setLastMessageSync = (
      value: React.SetStateAction<ArrayBuffer | undefined>
    ): void => {
      flushSync(() => {
        setLastMessage(value);
      });
    };
    const filter =
      opcode !== undefined
        ? (value: ArrayBuffer): boolean => {
            const filterPayload = ByteBuffer.from(value);
            const filterOpcode = filterPayload.readOpcode();
            return Array.isArray(opcode)
              ? opcode.includes(filterOpcode)
              : filterOpcode === opcode;
          }
        : undefined;
    const props: WebSocketListenProps = {
      name,
      webSocketRef,
      setSocketState,
      setLastMessage,
      setLastMessageSync,
      filter,
    };
    return registry.listen(props);
  }, [name, registry]);
  const onceRef = useRef<typeof once>();
  useEffect(() => {
    onceRef.current = once;
  }, [once]);
  useEffect(() => {
    const once = onceRef.current;
    if (lastMessage === undefined || once === undefined) {
      return;
    }

    const payload = ByteBuffer.from(lastMessage);
    const opcode = payload.readOpcode();
    const response = once(opcode, payload);
    const sendResponse = (response: ResponsePayload) => {
      if (response !== undefined) {
        if (Array.isArray(response)) {
          for (const buffer of response) {
            webSocketRef.current?.send(buffer.toArray());
          }
        } else {
          webSocketRef.current?.send(response.toArray());
        }
      }
    };
    if (response instanceof Promise) {
      response.then(sendResponse).catch(() => {
        //NOTE: do not handle error
      });
    } else {
      sendResponse(response);
    }
  }, [lastMessage]);

  const lastPayload =
    lastMessage !== undefined ? ByteBuffer.from(lastMessage) : undefined;
  const lastOpcode = lastPayload?.readOpcode();

  return {
    dangerouslyGetWebSocketRef: webSocketRef,
    socketState,
    lastOpcode,
    lastPayload,
    sendPayload,
  };
}

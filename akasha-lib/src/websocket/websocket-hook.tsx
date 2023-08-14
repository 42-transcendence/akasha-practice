"use client";

import { ByteBuffer } from "../library/byte-buffer";
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
import {
  SocketCloseResult,
  SocketState,
  WebSocketListenProps,
  WebSocketRegisterProps,
  WebSocketRegistry,
} from "./websocket-registry";

const RegistryContext = createContext(WebSocketRegistry.DEFAULT);

export function WebSocketRegistryContainer({
  children,
}: React.PropsWithChildren) {
  const registry = useMemo(() => {
    return new WebSocketRegistry();
  }, []);
  return (
    <RegistryContext.Provider value={registry}>
      {children}
    </RegistryContext.Provider>
  );
}

export function WebSocketContainer({
  children,
  ...rest
}: React.PropsWithChildren<WebSocketRegisterProps>) {
  const registry: WebSocketRegistry = useContext(RegistryContext);
  useEffect(() => {
    return registry.register(rest);
  }, [registry, rest]);
  return children;
}

export function useWebSocket(
  name: string,
  opcode?: number | number[] | undefined,
  once?: (
    opcode: number,
    buffer: ByteBuffer
  ) => ByteBuffer | ByteBuffer[] | undefined | void
): {
  dangerouslyGetWebSocketRef: React.MutableRefObject<WebSocket | undefined>;
  socketState: SocketState;
  socketCloseResult: SocketCloseResult | undefined;
  lastOpcode: number | undefined;
  lastPayload: ByteBuffer | undefined;
  sendPayload: (value: ByteBuffer) => void;
} {
  const registry: WebSocketRegistry = useContext(RegistryContext);
  const webSocketRef = useRef<WebSocket>();
  const [socketState, setSocketState] = useState(SocketState.INITIAL);
  const [socketCloseResult, setSocketCloseResult] =
    useState<SocketCloseResult>();
  const [lastMessage, _setLastMessage] = useState<ArrayBuffer>();
  const sendPayload = useCallback((value: ByteBuffer): void => {
    webSocketRef.current?.send(value.toArray());
  }, []);
  useEffect(() => {
    const setLastMessage = (
      value: React.SetStateAction<ArrayBuffer | undefined>
    ): void => {
      flushSync(() => {
        _setLastMessage(value);
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
      setSocketCloseResult,
      setLastMessage,
      filter,
    };
    return registry.listen(props);
  }, [registry, name, opcode]);
  useEffect(() => {
    if (lastMessage === undefined || once === undefined) {
      return;
    }

    const payload = ByteBuffer.from(lastMessage);
    const opcode = payload.readOpcode();
    const response = once(opcode, payload);
    if (response !== undefined) {
      if (Array.isArray(response)) {
        for (const buffer of response) {
          webSocketRef.current?.send(buffer.toArray());
        }
      } else {
        webSocketRef.current?.send(response.toArray());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage]);

  const lastPayload =
    lastMessage !== undefined ? ByteBuffer.from(lastMessage) : undefined;
  const lastOpcode = lastPayload?.readOpcode();

  return {
    dangerouslyGetWebSocketRef: webSocketRef,
    socketState,
    socketCloseResult,
    lastOpcode,
    lastPayload,
    sendPayload,
  };
}

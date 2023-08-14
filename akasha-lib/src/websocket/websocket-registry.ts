export type WebSocketRegisterProps = {
  name: string;
  url: string | URL;
  protocols?: string | string[] | undefined;
  handshake?:
    | ((
        evt: Event
      ) =>
        | ArrayBufferLike
        | ArrayBufferView
        | ArrayBufferLike[]
        | ArrayBufferView[]
        | undefined)
    | undefined;
  onClose?: ((evt: CloseEvent) => void) | undefined;
  onError?: ((evt: Event) => void) | undefined;
  onMessage?: ((evt: MessageEvent) => void) | undefined;
  onOpen?: ((evt: Event) => void) | undefined;
};

export enum SocketStateNumber {
  INITIAL,
  OPEN,
  CLOSED,
  RECONNECTING,
}

export type InitialSocketState = {
  number: SocketStateNumber.INITIAL;
};

export type OpenSocketState = {
  number: SocketStateNumber.OPEN;
};

export type ClosedSocketState = {
  number: SocketStateNumber.CLOSED;
} & ClosedSocketReason;

export type ClosedSocketReason = {
  code: number;
  reason: string;
  wasClean: boolean;
};

export type ReconnectingSocketState = {
  number: SocketStateNumber.RECONNECTING;
};

export type SocketState =
  | InitialSocketState
  | OpenSocketState
  | ClosedSocketState
  | ReconnectingSocketState;

export type WebSocketListenProps = {
  name: string;
  webSocketRef: React.MutableRefObject<WebSocket | undefined>;
  setSocketState: React.Dispatch<React.SetStateAction<SocketState>>;
  setLastMessage: React.Dispatch<React.SetStateAction<ArrayBuffer | undefined>>;
  setLastMessageSync: React.Dispatch<
    React.SetStateAction<ArrayBuffer | undefined>
  >;
  filter: ((value: ArrayBuffer) => boolean) | undefined;
  handleError?: ((ev: Event) => void) | undefined;
  handleClose?: ((result: ClosedSocketReason) => void) | undefined;
};

class WebSocketEntry {
  webSocket: WebSocket | undefined;
  lastState: SocketState = { number: SocketStateNumber.INITIAL };
  lastMessage: ArrayBuffer | undefined;
}

export class WebSocketRegistry {
  static readonly DEFAULT = new WebSocketRegistry();

  private readonly registry = new Map<string, WebSocketEntry>();
  private readonly listeners = new Map<string, Set<WebSocketListenProps>>();

  register(props: WebSocketRegisterProps): () => void {
    const key = props.name;
    if (this.registry.has(key)) {
      throw new ReferenceError();
    }
    const value = new WebSocketEntry();

    const webSocket = new WebSocket(props.url, props.protocols);
    webSocket.binaryType = "arraybuffer";

    if (props.onClose !== undefined) {
      webSocket.addEventListener("close", props.onClose);
    }

    if (props.onError !== undefined) {
      webSocket.addEventListener("error", props.onError);
    }

    if (props.onMessage !== undefined) {
      webSocket.addEventListener("message", props.onMessage);
    }

    if (props.onOpen !== undefined) {
      webSocket.addEventListener("open", props.onOpen);
    }

    const listeners = this.ensureListenerSet(key);

    webSocket.addEventListener("close", (ev) => {
      const state: ClosedSocketState = {
        number: SocketStateNumber.CLOSED,
        ...ev,
      };

      value.webSocket = undefined;
      value.lastState = state;
      value.lastMessage = undefined;

      for (const listener of listeners) {
        listener.handleClose?.(ev);
        listener.webSocketRef.current = undefined;
        listener.setSocketState(state);
        listener.setLastMessage(undefined);
      }
    });

    webSocket.addEventListener("error", (ev) => {
      for (const listener of listeners) {
        listener.handleError?.(ev);
      }
    });

    webSocket.addEventListener("message", (ev) => {
      const message: ArrayBuffer = ev.data;

      value.lastMessage = message;

      for (const listener of listeners) {
        if (listener.filter?.(message) ?? true) {
          listener.setLastMessageSync(message);
        }
      }
    });

    webSocket.addEventListener("open", (ev) => {
      if (props.handshake !== undefined) {
        const data:
          | ArrayBufferLike
          | ArrayBufferView
          | ArrayBufferLike[]
          | ArrayBufferView[]
          | undefined = props.handshake(ev);
        if (data !== undefined) {
          if (Array.isArray(data)) {
            for (const buffer of data) {
              webSocket.send(buffer);
            }
          } else {
            webSocket.send(data);
          }
        }
      }

      const state: OpenSocketState = { number: SocketStateNumber.OPEN };

      value.webSocket = webSocket;
      value.lastState = state;
      value.lastMessage = undefined;

      for (const listener of listeners) {
        listener.webSocketRef.current = webSocket;
        listener.setSocketState(state);
        listener.setLastMessage(undefined);
      }
    });

    this.registry.set(key, value);
    return () => {
      this.registry.delete(key);
      webSocket.close();
    };
  }

  listen(props: WebSocketListenProps): () => void {
    const key = props.name;
    const value = this.ensureListenerSet(key);

    if (value.has(props)) {
      throw new ReferenceError();
    }

    const entry = this.registry.get(key);
    if (entry !== undefined) {
      props.webSocketRef.current = entry.webSocket;
      props.setSocketState(entry.lastState);
      props.setLastMessage(entry.lastMessage);
    }

    value.add(props);
    return () => {
      value.delete(props);
    };
  }

  private ensureListenerSet(key: string) {
    const prev = this.listeners.get(key);
    if (prev !== undefined) {
      return prev;
    }

    const value = new Set<WebSocketListenProps>();
    this.listeners.set(key, value);
    return value;
  }
}

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

export enum SocketState {
  INITIAL,
  OPEN,
  CLOSED,
  RECONNECTING,
}

export type SocketCloseResult = {
  code: number;
  reason: string;
  wasClean: boolean;
};

export type WebSocketListenProps = {
  name: string;
  webSocketRef: React.MutableRefObject<WebSocket | undefined>;
  setSocketState: React.Dispatch<React.SetStateAction<SocketState>>;
  setSocketCloseResult: React.Dispatch<
    React.SetStateAction<SocketCloseResult | undefined>
  >;
  setLastMessage: React.Dispatch<React.SetStateAction<ArrayBuffer | undefined>>;
  filter: ((value: ArrayBuffer) => boolean) | undefined;
  handleError?: ((ev: Event) => void) | undefined;
  handleClose?: ((result: SocketCloseResult) => void) | undefined;
};

export class WebSocketRegistry {
  static readonly DEFAULT = new WebSocketRegistry();

  private readonly registry = new Map<string, WebSocket>();
  private readonly listeners = new Map<string, Set<WebSocketListenProps>>();

  register(props: WebSocketRegisterProps): () => void {
    const key = props.name;
    if (this.registry.has(key)) {
      throw new ReferenceError();
    }
    const value = new WebSocket(props.url, props.protocols);
    value.binaryType = "arraybuffer";

    if (props.onClose !== undefined) {
      value.addEventListener("close", props.onClose);
    }

    if (props.onError !== undefined) {
      value.addEventListener("error", props.onError);
    }

    if (props.onMessage !== undefined) {
      value.addEventListener("message", props.onMessage);
    }

    if (props.onOpen !== undefined) {
      value.addEventListener("open", props.onOpen);
    }

    const listeners = this.ensureListenerSet(key);

    value.addEventListener("close", (ev) => {
      for (const listener of listeners) {
        listener.handleClose?.(ev);
        listener.webSocketRef.current = undefined;
        listener.setSocketState(SocketState.CLOSED);
        listener.setLastMessage(undefined);
      }
    });

    value.addEventListener("error", (ev) => {
      for (const listener of listeners) {
        listener.handleError?.(ev);
      }
    });

    value.addEventListener("message", (ev) => {
      const message: ArrayBuffer = ev.data;
      for (const listener of listeners) {
        if (listener.filter?.(message) ?? true) {
          listener.setLastMessage(message);
        }
      }
    });

    value.addEventListener("open", (ev) => {
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
              value.send(buffer);
            }
          } else {
            value.send(data);
          }
        }
      }

      for (const listener of listeners) {
        listener.webSocketRef.current = value;
        listener.setSocketState(SocketState.OPEN);
        listener.setLastMessage(undefined);
      }
    });

    this.registry.set(key, value);
    return () => {
      this.registry.delete(key);
    };
  }

  listen(props: WebSocketListenProps): () => void {
    const key = props.name;
    const value = this.ensureListenerSet(key);

    if (value.has(props)) {
      throw new ReferenceError();
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

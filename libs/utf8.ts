export function encodeUtf8(msg: string): Uint8Array {
  return new TextEncoder().encode(msg);
}

export function decodeUtf8(str: Uint8Array): string {
  return new TextDecoder().decode(str);
}

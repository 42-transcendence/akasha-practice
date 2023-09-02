export function encodeUTF8(msg: string): Uint8Array {
  return new TextEncoder().encode(msg);
}

export function decodeUTF8(str: Uint8Array): string {
  return new TextDecoder().decode(str);
}

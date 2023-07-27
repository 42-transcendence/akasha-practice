export function toHexString(arr: Uint8Array): string {
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHexString(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, "hex"));
}

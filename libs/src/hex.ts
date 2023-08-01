type HexString = string & { __hex__: never };

export function toHexString(arr: Uint8Array): HexString {
  const str = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  return str as HexString;
}

export function isHexString(str: string): str is HexString {
  return /^[0-9A-Fa-f]*$/.test(str);
}

export function fromHexString(str: HexString): Uint8Array {
  const result = new Uint8Array(str.length / 2);

  for (let i = 0; i < result.length; i++) {
    result[i] = parseInt(str.substring(2 * i, 2 * (i + 1)), 16);
  }

  return result;
}

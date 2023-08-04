export class InvalidUUIDError extends Error {
  override get name() {
    return "InvalidUUIDError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

type UUIDString = string & { __uuid__: never };

export function stringifyUUID(arr: Readonly<Uint8Array>): UUIDString {
  if (arr.length !== 16) {
    throw new InvalidUUIDError();
  }

  const value1 =
    BigInt((arr[0] << 24) | (arr[1] << 16) | (arr[2] << 8) | (arr[3] << 0)) &
    BigInt(0xffffffff);
  const value2 = (arr[4] << 8) | (arr[5] << 0);
  const value3 = (arr[6] << 8) | (arr[7] << 0);
  const value4 = (arr[8] << 8) | (arr[9] << 0);
  const value5 =
    (BigInt(arr[10]) << BigInt(40)) |
    (BigInt(arr[11]) << BigInt(32)) |
    (BigInt(arr[12]) << BigInt(24)) |
    (BigInt(arr[13]) << BigInt(16)) |
    (BigInt(arr[14]) << BigInt(8)) |
    (BigInt(arr[15]) << BigInt(0));

  const value1Str = value1.toString(16).padStart(8, "0");
  const value2Str = value2.toString(16).padStart(4, "0");
  const value3Str = value3.toString(16).padStart(4, "0");
  const value4Str = value4.toString(16).padStart(4, "0");
  const value5Str = value5.toString(16).padStart(12, "0");

  return `${value1Str}-${value2Str}-${value3Str}-${value4Str}-${value5Str}` as UUIDString;
}

export function validateUUID(str: string): str is UUIDString {
  const regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(str);
}

export function parseUUID(str: UUIDString): Uint8Array {
  const result = new Uint8Array(16);

  const value1 = parseInt(str.slice(0, 8), 16);
  const value2 = parseInt(str.slice(9, 13), 16);
  const value3 = parseInt(str.slice(14, 18), 16);
  const value4 = parseInt(str.slice(19, 23), 16);
  const value5 = BigInt("0x" + str.slice(24, 36));

  result[0] = (value1 >>> 24) & 0xff;
  result[1] = (value1 >>> 16) & 0xff;
  result[2] = (value1 >>> 8) & 0xff;
  result[3] = (value1 >>> 0) & 0xff;

  result[4] = (value2 >>> 8) & 0xff;
  result[5] = (value2 >>> 0) & 0xff;

  result[6] = (value3 >>> 8) & 0xff;
  result[7] = (value3 >>> 0) & 0xff;

  result[8] = (value4 >>> 8) & 0xff;
  result[9] = (value4 >>> 0) & 0xff;

  result[10] = Number((value5 >> BigInt(40)) & BigInt(0xff));
  result[11] = Number((value5 >> BigInt(32)) & BigInt(0xff));
  result[12] = Number((value5 >> BigInt(24)) & BigInt(0xff));
  result[13] = Number((value5 >> BigInt(16)) & BigInt(0xff));
  result[14] = Number((value5 >> BigInt(8)) & BigInt(0xff));
  result[15] = Number((value5 >> BigInt(0)) & BigInt(0xff));

  return result;
}

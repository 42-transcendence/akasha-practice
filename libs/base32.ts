const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const padding = "=";

export function base32_encode(arr: Uint8Array): string {
  const result = new Array<string>();

  let shift = 3;
  let carry = 0;

  for (let i = 0; i < arr.length; i++) {
    const data = arr[i];

    {
      const value = carry | (data >> shift);
      result.push(alphabet[value & 0x1f]);
    }

    if (shift > 5) {
      const value = data >> (shift - 5);
      result.push(alphabet[value & 0x1f]);

      shift -= 5;
    }

    carry = data << (5 - shift);
    shift += 3;
  }

  if (shift !== 3) {
    result.push(alphabet[carry & 0x1f]);
  }

  return result.join("");
}

export function base32_decode(str: string): Uint8Array {
  const result = new Array<number>();

  let shift = 8;
  let carry = 0;

  for (const data of str) {
    if (data === padding) {
      continue;
    }

    const value = alphabet.indexOf(data);

    if (shift > 5) {
      carry |= value << (shift - 5);
      shift -= 5;
    } else if (shift < 5) {
      result.push(carry | (value >> (5 - shift)));
      carry = (value << (shift + 3)) & 0xff;
      shift += 3;
    } else {
      result.push(carry | value);
      carry = 0;
      shift = 8;
    }
  }

  if (shift !== 8 && carry !== 0) {
    result.push(carry);
  }

  return new Uint8Array(result);
}

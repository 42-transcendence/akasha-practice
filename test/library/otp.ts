// Reference: https://datatracker.ietf.org/doc/html/rfc4226
// Reference: https://datatracker.ietf.org/doc/html/rfc6238

import { HashAlgorithm, signatureHMAC } from "./hash";

const DIGITS_POWER: readonly number[] =
  //0   1    2     3      4       5        6         7          8
  [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000];

export async function generateOTP(
  secret: Uint8Array,
  movingFactor: number,
  codeDigits: number,
  algorithm: HashAlgorithm
): Promise<string> {
  // put movingFactor value into text byte array
  const text = new Uint8Array(8);
  for (let i = text.length - 1; i >= 0; i--) {
    text[i] = movingFactor & 0xff;
    movingFactor >>= 8;
  }

  // compute hmac hash
  const hash: Uint8Array = await signatureHMAC(algorithm, secret, text);

  // put selected bytes into result int
  const offset: number = hash[hash.length - 1] & 0xf;

  const binary: number =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp: number = binary % DIGITS_POWER[codeDigits];

  return otp.toString().padStart(codeDigits, "0");
}

export namespace TOTP {
  export function getMovingFactor(period: number): number {
    const secondsElapsed: number = Date.now() / 1000;
    return Math.floor(secondsElapsed / period);
  }

  export function createdAt(period: number, movingFactor: number): number {
    return new Date((movingFactor + 0) * period * 1000).getTime();
  }

  export function expiredAt(period: number, movingFactor: number): number {
    return new Date((movingFactor + 1) * period * 1000).getTime();
  }
}

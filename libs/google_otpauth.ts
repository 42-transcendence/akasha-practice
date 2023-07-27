// Reference: https://github.com/google/google-authenticator/wiki/Key-Uri-Format

import { HashAlgorithm, hmacGenerateKey } from "./hash";
import { base32_encode } from "./base32";

async function createNewOTP(
  algorithm: HashAlgorithm,
  issuer: string,
  subject: string,
  digits: number = 6,
  period: number = 30,
  counter: number | undefined
) {
  const key: Uint8Array = await hmacGenerateKey(algorithm);
  const uri: URL = new URL("otpauth://");
  uri.hostname = !counter ? "totp" : "hotp";
  uri.pathname = `${issuer}:${subject}`;
  uri.searchParams.set("secret", base32_encode(key));
  uri.searchParams.set("issuer", issuer);
  uri.searchParams.set("algorithm", algorithm);
  uri.searchParams.set("digits", digits.toString());
  uri.searchParams.set("period", period.toString());
  if (counter) {
    uri.searchParams.set("counter", counter.toString());
  }
  return { key, uri };
}

// Reference: https://github.com/google/google-authenticator/wiki/Key-Uri-Format

import { HashAlgorithm, generateHMACKey } from "./hash";
import { encodeBase32 } from "./base32";

type OTPAuthAlgorithm = "SHA1" | "SHA256" | "SHA512";

function toHashAlgorithm(algorithm: OTPAuthAlgorithm): HashAlgorithm {
  switch (algorithm) {
    case "SHA1":
      return "SHA-1";
    case "SHA256":
      return "SHA-256";
    case "SHA512":
      return "SHA-512";
    default:
      const _exhaustiveCheck: never = algorithm;
      return _exhaustiveCheck;
  }
}

export async function createNewOTPKey(
  algorithm: OTPAuthAlgorithm,
  issuer: string,
  subject: string,
  digits: number = 6,
  period: number = 30,
  counter?: number | undefined
) {
  const key: Uint8Array = await generateHMACKey(toHashAlgorithm(algorithm));
  const uri = new URL("otpauth://");
  uri.hostname = counter === undefined ? "totp" : "hotp";
  uri.pathname = `${issuer}:${subject}`;
  uri.searchParams.set("secret", encodeBase32(key));
  uri.searchParams.set("issuer", issuer);
  uri.searchParams.set("algorithm", algorithm);
  uri.searchParams.set("digits", digits.toString());
  uri.searchParams.set("period", period.toString());
  if (counter !== undefined) {
    uri.searchParams.set("counter", counter.toString());
  }
  return { key, uri };
}

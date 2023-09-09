// Reference: https://developer.mozilla.org/docs/Web/API/Web_Crypto_API

export type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export async function digestMessage(
  algorithm: HashAlgorithm,
  data: Uint8Array
): Promise<Uint8Array> {
  const hash: ArrayBuffer = await crypto.subtle.digest(algorithm, data);
  return new Uint8Array(hash);
}

export async function generateHMACKey(
  algorithm: HashAlgorithm,
  length?: number
): Promise<Uint8Array> {
  const generatedKey: CryptoKey = await crypto.subtle.generateKey(
    {
      name: "HMAC",
      length,
      hash: { name: algorithm },
    },
    true,
    ["verify"]
  );
  const extractedKey: ArrayBuffer = await crypto.subtle.exportKey(
    "raw",
    generatedKey
  );
  return new Uint8Array(extractedKey);
}

export async function signatureHMAC(
  algorithm: HashAlgorithm,
  key: Uint8Array,
  data: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey: CryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    {
      name: "HMAC",
      hash: { name: algorithm },
    },
    false,
    ["sign"]
  );
  const buffer: ArrayBuffer = await crypto.subtle.sign(
    { name: "HMAC" },
    cryptoKey,
    data
  );
  return new Uint8Array(buffer);
}

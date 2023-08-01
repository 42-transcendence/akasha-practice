import * as jose from "jose";

export type HashAlgorithm = "HS256" | "HS384" | "HS512";

export type JWTOptions = {
  issuer?: string | undefined;
  subject?: string | undefined;
  audience?: string | undefined;
};

type JWTPayload = Record<string, unknown>;

type JWTSuccessful = { success: true; payload: JWTPayload };

type JWTFailed = { success: false; expired: boolean };

type JWTResult = JWTSuccessful | JWTFailed;

export async function jwtSignatureHMAC(
  algorithm: HashAlgorithm,
  secret: Uint8Array,
  payload: JWTPayload,
  expireSecs?: number | undefined,
  option?: JWTOptions | undefined
): Promise<string> {
  const now: number = Math.floor(Date.now() / 1000);

  const signature = new jose.SignJWT(payload);
  signature.setProtectedHeader({ alg: algorithm, typ: "JWT" });
  if (option?.issuer) {
    signature.setIssuer(option?.issuer);
  }
  if (option?.subject) {
    signature.setSubject(option?.subject);
  }
  if (option?.audience) {
    signature.setAudience(option?.audience);
  }
  if (expireSecs) {
    const expiredAt: number = now + Math.floor(expireSecs);
    signature.setExpirationTime(expiredAt);
  }
  signature.setIssuedAt(now);

  const jwt = await signature.sign(secret);
  return jwt;
}

export async function jwtVerifyHMAC(
  jwt: string,
  algorithm: HashAlgorithm,
  secret: Uint8Array,
  option?: JWTOptions | undefined
): Promise<JWTResult> {
  try {
    const { payload } = await jose.jwtVerify(jwt, secret, {
      algorithms: [algorithm],
      typ: "JWT",
      ...option,
    });
    return { success: true, payload };
  } catch (e) {
    return { success: false, expired: e instanceof jose.errors.JWTExpired };
  }
}

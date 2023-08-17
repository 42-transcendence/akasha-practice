import { AkashaGlobal } from "@/global";
import { AuthLevel, AuthPayload } from "@/user/auth/auth-payload";
import { AuthService } from "@/user/auth/auth.service";
import { HttpException } from "@nestjs/common";
import { ServerOptions } from "ws";

type VerifyClient = ServerOptions["verifyClient"];

export function verifyClientViaQueryParam(
  queryParamKey: string,
  levelMin: AuthLevel = AuthLevel.REGULAR,
): VerifyClient {
  return async function verifyClient({ req }, callback) {
    const url = new URL(req.url ?? "", `ws://${req.headers.host}/`);
    const values = url.searchParams.getAll(queryParamKey);
    if (values.length !== 1) {
      return callback(false, 400, "Missing or multiple authorization token");
    }
    const value = values[0];

    const auth = AkashaGlobal.getInstance().get(AuthService);
    try {
      const payload: AuthPayload = await auth.extractJWTPayload(value);
      return callback(payload.auth_level >= levelMin);
    } catch (e) {
      if (e instanceof HttpException) {
        return callback(false, e.getStatus(), e.message);
      }
      if (e instanceof Error) {
        return callback(false, 500, e.message);
      }
      return callback(false, 500);
    }
  };
}

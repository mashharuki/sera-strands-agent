import { verifyAccessToken } from "@privy-io/node";
import type { MiddlewareHandler } from "hono";

export type AuthedVariables = {
  userId: string;
};

/**
 * FR-019: 未ログインの利用者からの操作は先に認証を要求する。
 * Privyが発行するaccess tokenをAuthorizationヘッダーから検証し、
 * userIdをコンテキストへ注入する。検証失敗時は401を返す。
 */
export function privyAuthMiddleware(): MiddlewareHandler<{
  Variables: AuthedVariables;
}> {
  const appId = process.env.PRIVY_APP_ID;
  const verificationKey = process.env.PRIVY_VERIFICATION_KEY;

  return async (c, next) => {
    if (!appId || !verificationKey) {
      return c.json(
        {
          code: "AUTH_NOT_CONFIGURED",
          message: "PRIVY_APP_ID/PRIVY_VERIFICATION_KEY is not set",
        },
        500,
      );
    }
    const header = c.req.header("Authorization");
    const accessToken = header?.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : undefined;
    if (!accessToken) {
      return c.json(
        { code: "UNAUTHENTICATED", message: "ログインが必要です" },
        401,
      );
    }
    try {
      const claims = await verifyAccessToken({
        access_token: accessToken,
        app_id: appId,
        verification_key: verificationKey,
      });
      c.set("userId", claims.user_id);
    } catch {
      return c.json(
        { code: "UNAUTHENTICATED", message: "ログインが必要です" },
        401,
      );
    }
    await next();
  };
}

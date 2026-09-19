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
  // .env等では改行を `\n`（バックスラッシュ+n）の1行で書くことが多いため、実際の改行に戻す。
  const verificationKey = process.env.PRIVY_VERIFICATION_KEY?.replace(
    /\\n/g,
    "\n",
  );

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
    // App Secret（秘密鍵相当）を検証キーとして誤設定していないか検出する。
    // 検証キーは "-----BEGIN PUBLIC KEY-----" で始まる公開鍵（PEM）。
    if (!verificationKey.includes("BEGIN PUBLIC KEY")) {
      console.error(
        "[auth] PRIVY_VERIFICATION_KEY is not a PEM public key. Use the 'Verification key' from the Privy dashboard, not the App Secret.",
      );
      return c.json(
        {
          code: "AUTH_NOT_CONFIGURED",
          message: "PRIVY_VERIFICATION_KEY の形式が不正です",
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
    } catch (error) {
      // トークンや鍵は出さず、失敗の種別だけを記録する。
      console.error("[auth] access token verification failed", {
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { code: "UNAUTHENTICATED", message: "ログインが必要です" },
        401,
      );
    }
    await next();
  };
}

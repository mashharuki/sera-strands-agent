import { verifyAccessToken } from "@privy-io/node";
import type { MiddlewareHandler } from "hono";

export type AuthedVariables = {
  userId: string;
};

export type PrivyVerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "not-configured" | "invalid-key" | "unauthenticated" };

/**
 * Privyのaccess tokenを検証する。REST(Hono)とチャット(Function URL)の両方で共有し、
 * 鍵の扱い（`\n`の復元、PEM形式チェック）とログの出し方を1箇所にそろえる。
 */
export async function verifyPrivyAccessToken(
  accessToken: string | undefined,
): Promise<PrivyVerifyResult> {
  const appId = process.env.PRIVY_APP_ID;
  // .env等では改行を `\n`（バックスラッシュ+n）の1行で書くことが多いため、実際の改行に戻す。
  const verificationKey = process.env.PRIVY_VERIFICATION_KEY?.replace(
    /\\n/g,
    "\n",
  );
  if (!appId || !verificationKey)
    return { ok: false, reason: "not-configured" };
  // App Secret（秘密鍵相当）を検証キーとして誤設定していないか検出する。
  // 検証キーは "-----BEGIN PUBLIC KEY-----" で始まる公開鍵（PEM）。
  if (!verificationKey.includes("BEGIN PUBLIC KEY")) {
    console.error(
      "[auth] PRIVY_VERIFICATION_KEY is not a PEM public key. Use the 'Verification key' from the Privy dashboard, not the App Secret.",
    );
    return { ok: false, reason: "invalid-key" };
  }
  if (!accessToken) return { ok: false, reason: "unauthenticated" };
  try {
    const claims = await verifyAccessToken({
      access_token: accessToken,
      app_id: appId,
      verification_key: verificationKey,
    });
    return { ok: true, userId: claims.user_id };
  } catch (error) {
    // トークンや鍵は出さず、失敗の種別だけを記録する。
    console.error("[auth] access token verification failed", {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: "unauthenticated" };
  }
}

export function extractBearerToken(
  header: string | undefined,
): string | undefined {
  return header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : undefined;
}

/**
 * FR-019: 未ログインの利用者からの操作は先に認証を要求する。
 * Privyが発行するaccess tokenをAuthorizationヘッダーから検証し、
 * userIdをコンテキストへ注入する。検証失敗時は401を返す。
 */
export function privyAuthMiddleware(): MiddlewareHandler<{
  Variables: AuthedVariables;
}> {
  return async (c, next) => {
    const result = await verifyPrivyAccessToken(
      extractBearerToken(c.req.header("Authorization")),
    );
    if (!result.ok && result.reason !== "unauthenticated") {
      return c.json(
        {
          code: "AUTH_NOT_CONFIGURED",
          message: "PRIVY_APP_ID/PRIVY_VERIFICATION_KEY の設定が不正です",
        },
        500,
      );
    }
    if (!result.ok) {
      return c.json(
        { code: "UNAUTHENTICATED", message: "ログインが必要です" },
        401,
      );
    }
    c.set("userId", result.userId);
    await next();
  };
}

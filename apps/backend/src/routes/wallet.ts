import { Hono } from "hono";
import {
  callSeraToolSafely,
  SeraToolError,
  toUserFacingMessage,
} from "../agent/errors.js";
import { getBalances } from "../agent/sera-tools.js";
import type { AuthedVariables } from "../auth/privy.js";
import { createWalletIfAbsent, getWallet } from "../store/wallets.js";

export const walletRoutes = new Hono<{ Variables: AuthedVariables }>();

/** FR-001, FR-002: 冪等なウォレット作成。契約(contracts/openapi.yaml)通り既存時は200、新規時は201。 */
walletRoutes.post("/wallet", async (c) => {
  const userId = c.get("userId");
  const address = c.req.query("address");
  const chainId = Number(c.req.query("chainId") ?? 11155111);
  if (!address) {
    return c.json(
      {
        code: "INVALID_REQUEST",
        message:
          "address is required (Privy embedded walletが発行したアドレス)",
      },
      400,
    );
  }
  const result = await createWalletIfAbsent(userId, address, chainId);
  return c.json(result.wallet, result.created ? 201 : 200);
});

/** FR-003: 自分のウォレット情報を取得する。 */
walletRoutes.get("/wallet", async (c) => {
  const userId = c.get("userId");
  const wallet = await getWallet(userId);
  if (!wallet) {
    return c.json(
      { code: "NOT_FOUND", message: "ウォレットが未作成です" },
      404,
    );
  }
  return c.json(wallet, 200);
});

/**
 * FR-003: 残高確認。FR-004: 対象は常に呼び出しユーザー自身の`wallet.address`のみで、
 * リクエストからアドレスを受け取らないため、他人のウォレットを問い合わせる経路は存在しない
 * （所有権検証の構造的な担保）。FR-017: sera-mcp呼び出し失敗時は成功と誤認させない。
 */
walletRoutes.get("/wallet/balance", async (c) => {
  const userId = c.get("userId");
  const wallet = await getWallet(userId);
  if (!wallet) {
    return c.json(
      {
        code: "NOT_FOUND",
        message: "ウォレットが未作成です。先にウォレットを作成してください",
      },
      404,
    );
  }
  try {
    const balances = await callSeraToolSafely("sera.get_balances", () =>
      getBalances(wallet.address),
    );
    return c.json({ walletAddress: wallet.address, balances }, 200);
  } catch (err) {
    if (err instanceof SeraToolError) {
      return c.json(
        { code: "SERA_UNAVAILABLE", message: toUserFacingMessage(err) },
        502,
      );
    }
    throw err;
  }
});

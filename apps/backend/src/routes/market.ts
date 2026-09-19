import { Hono } from "hono";
import {
  callSeraToolSafely,
  SeraToolError,
  toUserFacingMessage,
} from "../agent/errors.js";
import { issueQuote } from "../agent/quote-service.js";
import { inferBook, settlementStatus } from "../agent/sera-tools.js";
import { normalizeTradeHistory } from "../agent/tools/history.js";
import type { AuthedVariables } from "../auth/privy.js";
import { getWallet } from "../store/wallets.js";

export const marketRoutes = new Hono<{ Variables: AuthedVariables }>();

function seraUnavailable(err: unknown) {
  return { code: "SERA_UNAVAILABLE", message: toUserFacingMessage(err) };
}

/** FR-005, FR-011: swapの価格見積もり（`sera.get_quote`）。有効期限付きで保存する。 */
marketRoutes.get("/market/quote", async (c) => {
  const userId = c.get("userId");
  const fromToken = c.req.query("fromToken");
  const toToken = c.req.query("toToken");
  const amount = c.req.query("amount");
  if (!fromToken || !toToken || !amount) {
    return c.json(
      {
        code: "INVALID_REQUEST",
        message: "fromToken, toToken, amount is required",
      },
      400,
    );
  }

  // sera.get_quote は owner_address が必須（非simulate時）。
  const wallet = await getWallet(userId);
  if (!wallet) {
    return c.json(
      { code: "NOT_FOUND", message: "ウォレットが未作成です" },
      404,
    );
  }

  try {
    const result = await issueQuote({
      userId,
      ownerAddress: wallet.address,
      from: fromToken,
      to: toToken,
      amount,
    });
    if (!result.ok) {
      return c.json(
        {
          code: "SERA_UNAVAILABLE",
          message: "見積もりの取得結果を解釈できませんでした",
        },
        502,
      );
    }
    const q = result.quote;
    return c.json(
      {
        quoteId: q.quoteId,
        fromToken: q.fromToken,
        toToken: q.toToken,
        amount: q.amount,
        estimatedRate: q.estimatedRate,
        estimatedFee: q.estimatedFee,
        expiresAt: new Date(q.expiresAt * 1000).toISOString(),
      },
      200,
    );
  } catch (err) {
    if (err instanceof SeraToolError) return c.json(seraUnavailable(err), 502);
    throw err;
  }
});

/**
 * FR-005: 板情報（参考値）。`sera.infer_book`は実際の板ではなく、見積もりを
 * 多点プローブして合成したラダー（registry.ts）。`isSynthetic: true`を必ず含める。
 */
marketRoutes.get("/market/orderbook", async (c) => {
  const pair = c.req.query("pair");
  const [base, quote] = pair?.split("/") ?? [];
  if (!pair || !base || !quote) {
    return c.json(
      { code: "INVALID_REQUEST", message: "pair is required (例: USDC/XSGD)" },
      400,
    );
  }
  try {
    const raw = (await callSeraToolSafely("sera.infer_book", () =>
      inferBook(base, quote),
    )) as { bids?: unknown; asks?: unknown };
    return c.json(
      { pair, isSynthetic: true, bids: raw?.bids ?? [], asks: raw?.asks ?? [] },
      200,
    );
  } catch (err) {
    if (err instanceof SeraToolError) return c.json(seraUnavailable(err), 502);
    throw err;
  }
});

/** FR-005: 取引履歴。`sera.settlement_status`を自分のウォレットで絞り込んで正規化する。 */
marketRoutes.get("/market/history", async (c) => {
  const userId = c.get("userId");
  const wallet = await getWallet(userId);
  if (!wallet) return c.json([], 200);
  try {
    const raw = await callSeraToolSafely("sera.settlement_status", () =>
      settlementStatus({ ownerAddress: wallet.address }),
    );
    return c.json(normalizeTradeHistory(raw), 200);
  } catch (err) {
    if (err instanceof SeraToolError) return c.json(seraUnavailable(err), 502);
    throw err;
  }
});

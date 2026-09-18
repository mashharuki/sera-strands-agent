import { Hono } from "hono";
import {
  callSeraToolSafely,
  SeraToolError,
  toUserFacingMessage,
} from "../agent/errors.js";
import { callSeraTool } from "../agent/sera-mcp-client.js";
import { normalizeTradeHistory } from "../agent/tools/history.js";
import type { AuthedVariables } from "../auth/privy.js";
import { saveQuote } from "../store/quotes.js";

export const marketRoutes = new Hono<{ Variables: AuthedVariables }>();

/**
 * sera-mcpの `get_quote` レスポンス形状は実際の疎通確認（スパイクS8想定、未実施）が
 * できていないため、確認できているフィールド（uuid, 有効期限）のみ信頼し、
 * その他は緩く受け取る（research.md §1.3参照）。
 */
interface RawQuoteResult {
  uuid?: string;
  quote_id?: string;
  route_params?: {
    min_output_amount?: string;
    expires_at?: string | number;
    rate?: string;
  };
  rate?: string;
  expires_at?: string | number;
  fee?: string;
}

function toEpochSeconds(
  value: string | number | undefined,
  fallbackSecondsFromNow: number,
): number {
  if (typeof value === "number")
    return value > 1e12 ? Math.floor(value / 1000) : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return Math.floor(Date.now() / 1000) + fallbackSecondsFromNow;
}

/** FR-005, FR-011: swapの価格見積もり。有効期限付きでDynamoDBへ保存する。 */
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

  try {
    const raw = (await callSeraToolSafely("get_quote", () =>
      callSeraTool("get_quote", { fromToken, toToken, amount }),
    )) as RawQuoteResult;

    const quoteId = raw.uuid ?? raw.quote_id;
    if (!quoteId) {
      return c.json(
        {
          code: "SERA_UNAVAILABLE",
          message: "見積もりの取得結果を解釈できませんでした",
        },
        502,
      );
    }
    const expiresAt = toEpochSeconds(
      raw.expires_at ?? raw.route_params?.expires_at,
      120,
    );

    await saveQuote({
      quoteId,
      userId,
      fromToken,
      toToken,
      amount,
      estimatedRate: raw.rate ?? raw.route_params?.rate ?? "",
      estimatedFee: raw.fee,
      expiresAt,
      status: "issued",
    });

    return c.json(
      {
        quoteId,
        fromToken,
        toToken,
        amount,
        estimatedRate: raw.rate ?? raw.route_params?.rate ?? "",
        estimatedFee: raw.fee,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      },
      200,
    );
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

/**
 * FR-005: 板情報（参考値）。sera-mcpの`infer_book`/`probe_depth`は実際の板データではなく
 * 見積もりを多点プローブして合成したラダーである（research.md §1.3）。
 * `isSynthetic: true` を必ず含め、実データと混同させない。
 */
marketRoutes.get("/market/orderbook", async (c) => {
  const pair = c.req.query("pair");
  if (!pair) {
    return c.json(
      { code: "INVALID_REQUEST", message: "pair is required" },
      400,
    );
  }
  try {
    const raw = (await callSeraToolSafely("probe_depth", () =>
      callSeraTool("probe_depth", { pair }),
    )) as { bids?: unknown; asks?: unknown };

    return c.json(
      { pair, isSynthetic: true, bids: raw.bids ?? [], asks: raw.asks ?? [] },
      200,
    );
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

/** FR-005: 取引履歴。sera-mcpの`settlement_status`系レスポンスを正規化する。 */
marketRoutes.get("/market/history", async (c) => {
  const userId = c.get("userId");
  try {
    const raw = await callSeraToolSafely("settlement_status", () =>
      callSeraTool("settlement_status", { userId }),
    );
    return c.json(normalizeTradeHistory(raw), 200);
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

import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { saveQuote } from "../../store/quotes.js";
import { callSeraToolSafely, toUserFacingMessage } from "../errors.js";
import { callSeraTool } from "../sera-mcp-client.js";

const inputSchema = z.object({
  fromToken: z.string().describe("交換元トークン（例: USDC）"),
  toToken: z.string().describe("交換先トークン（例: USDT）"),
  amount: z.string().describe("交換元トークンの数量"),
});

/** T043: swapの価格見積もりをチャットから取得する。板情報・取引履歴とは別物（FR-005）。 */
export function createQuoteTool(userId: string) {
  return tool({
    name: "get_swap_quote",
    description:
      "stablecoinのswapの価格見積もり（有効期限付き）を取得する。これは現在の板情報でも過去の取引履歴でもない、見込みの交換レートである。",
    inputSchema,
    callback: async (input) => {
      try {
        const raw = (await callSeraToolSafely("get_quote", () =>
          callSeraTool("get_quote", input),
        )) as { uuid?: string; quote_id?: string; rate?: string };
        const quoteId = raw.uuid ?? raw.quote_id;
        if (!quoteId)
          return { error: "見積もりの取得結果を解釈できませんでした" };

        const expiresAt = Math.floor(Date.now() / 1000) + 120;
        await saveQuote({
          quoteId,
          userId,
          fromToken: input.fromToken,
          toToken: input.toToken,
          amount: input.amount,
          estimatedRate: raw.rate ?? "",
          expiresAt,
          status: "issued",
        });
        return { quoteId, estimatedRate: raw.rate, expiresInSeconds: 120 };
      } catch (err) {
        return { error: toUserFacingMessage(err) };
      }
    },
  });
}

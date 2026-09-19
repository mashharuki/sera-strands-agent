import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { callSeraToolSafely, toUserFacingMessage } from "../errors.js";
import { inferBook } from "../sera-tools.js";

const inputSchema = z.object({
  base: z.string().describe("基準トークンのシンボル（例: USDC）"),
  quote: z.string().describe("相手トークンのシンボル（例: XSGD）"),
});

/**
 * T044: 板情報（参考値）をチャットから取得する。
 * Seraは実際の板を公開しておらず、`sera.infer_book`は見積もりを多点プローブして
 * 合成した近似ラダーである（registry.tsの説明: "Use for visualizing depth, not for execution"）。
 */
export function createOrderbookTool() {
  return tool({
    name: "get_orderbook",
    description:
      "指定したトークンペアの板情報（参考値）を取得する。これは実際の取引所の板データではなく、見積もりを多点プローブして合成した近似値であることを必ずユーザーに伝えること。価格見積もりや取引履歴とは別物。",
    inputSchema,
    callback: async (input) => {
      try {
        const raw = (await callSeraToolSafely("sera.infer_book", () =>
          inferBook(input.base, input.quote),
        )) as { bids?: unknown; asks?: unknown };
        return {
          pair: `${input.base}/${input.quote}`,
          isSynthetic: true,
          bids: raw?.bids ?? [],
          asks: raw?.asks ?? [],
        };
      } catch (err) {
        return { error: toUserFacingMessage(err) };
      }
    },
  });
}

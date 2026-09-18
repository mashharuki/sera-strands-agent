import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { callSeraToolSafely, toUserFacingMessage } from "../errors.js";
import { callSeraTool } from "../sera-mcp-client.js";

const inputSchema = z.object({
  pair: z.string().describe("トークンペア（例: USDC/USDT）"),
});

/**
 * T044: 板情報（参考値）をチャットから取得する。
 * sera-mcpは実際の板情報を持たず、`probe_depth`は見積もりを多点プローブして
 * 合成した近似ラダーである（research.md §1.3）。回答時は必ず「参考値・実データではない」
 * ことをユーザーに伝えるようLLMへ指示する。
 */
export function createOrderbookTool() {
  return tool({
    name: "get_orderbook",
    description:
      "指定したトークンペアの板情報（参考値）を取得する。これは実際の取引所の板データではなく、見積もりを多点プローブして合成した近似値であることを必ずユーザーに伝えること。価格見積もりや取引履歴とは別物。",
    inputSchema,
    callback: async (input) => {
      try {
        const raw = (await callSeraToolSafely("probe_depth", () =>
          callSeraTool("probe_depth", input),
        )) as { bids?: unknown; asks?: unknown };
        return {
          pair: input.pair,
          isSynthetic: true,
          bids: raw.bids ?? [],
          asks: raw.asks ?? [],
        };
      } catch (err) {
        return { error: toUserFacingMessage(err) };
      }
    },
  });
}

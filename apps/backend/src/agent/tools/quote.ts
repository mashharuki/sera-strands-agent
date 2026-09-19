import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { getWallet } from "../../store/wallets.js";
import { toUserFacingMessage } from "../errors.js";
import { issueQuote } from "../quote-service.js";

const inputSchema = z.object({
  from: z.string().describe("交換元トークンのシンボル（例: USDC）"),
  to: z.string().describe("交換先トークンのシンボル（例: XSGD）"),
  amount: z.string().describe("交換元トークンの数量（人間が読む単位）"),
});

/** T043: swapの価格見積もりをチャットから取得する。板情報・取引履歴とは別物（FR-005）。 */
export function createQuoteTool(userId: string) {
  return tool({
    name: "get_swap_quote",
    description:
      "stablecoinのswapの価格見積もり（有効期限付き）を取得する。これは現在の板情報でも過去の取引履歴でもない、見込みの交換レートである。",
    inputSchema,
    callback: async (input) => {
      const wallet = await getWallet(userId);
      if (!wallet) {
        return {
          error: "ウォレットが未作成です。先にウォレットを作成してください",
        };
      }
      try {
        const result = await issueQuote({
          userId,
          ownerAddress: wallet.address,
          from: input.from,
          to: input.to,
          amount: input.amount,
        });
        if (!result.ok)
          return { error: "見積もりの取得結果を解釈できませんでした" };
        const q = result.quote;
        return {
          quoteId: q.quoteId,
          fromToken: q.fromToken,
          toToken: q.toToken,
          amount: q.amount,
          estimatedRate: q.estimatedRate,
          expiresAt: new Date(q.expiresAt * 1000).toISOString(),
          requiresPermit: q.requiresPermit ?? false,
        };
      } catch (err) {
        return { error: toUserFacingMessage(err) };
      }
    },
  });
}

import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { createApprovalRequest } from "../../store/approvals.js";
import { getQuote, isQuoteExpired } from "../../store/quotes.js";
import { getWallet } from "../../store/wallets.js";

const inputSchema = z.object({
  quoteId: z
    .string()
    .describe(
      "事前にget_swap_quoteで取得した見積もりID。まだ見積もりが無い場合は先にget_swap_quoteを呼ぶこと。",
    ),
  amount: z
    .string()
    .describe("交換元トークンの数量（見積もり取得時と同じ数量）"),
});

/**
 * T057: チャットでのswap意図検出。FR-006: fromToken/toToken/amountが揃うまで
 * （＝先にget_swap_quoteが呼ばれるまで）このツールをLLMは呼び出さない設計とし、
 * 不足時はLLMがユーザーへ質問する（システムプロンプトで指示済み）。
 *
 * このツール自体はswapを実行しない。ApprovalRequestを作成して
 * `approval_required`としてフロントエンドへ伝えるところまでを担う（FR-008,FR-009）。
 * 実際の実行は `POST /transactions/swap/confirm`（チャット承認＋ウォレット署名後）。
 */
export function createSwapIntentTool(
  userId: string,
  onApprovalCreated: (approvalId: string) => void,
) {
  return tool({
    name: "request_swap",
    description:
      "stablecoinのswapを依頼する。実行はせず、ユーザーへの確認内容（ネットワーク・トークン・数量・手数料・スリッページ）を提示する準備をするだけ。実際の実行にはユーザーのチャット承認とウォレット署名が別途必要。",
    inputSchema,
    callback: async (input) => {
      const quote = await getQuote(input.quoteId);
      if (!quote || quote.userId !== userId) {
        return {
          error:
            "指定された見積もりが見つかりません。先にget_swap_quoteで見積もりを取得してください",
        };
      }
      if (isQuoteExpired(quote)) {
        return {
          error:
            "見積もりの有効期限が切れています。get_swap_quoteで取り直してください",
        };
      }
      if (quote.requiresPermit) {
        return {
          error:
            "このトークンの見積もりはEIP-2612 permitの追加署名が必要で、現在は未対応です",
        };
      }
      const wallet = await getWallet(userId);
      if (!wallet) {
        return {
          error: "ウォレットが未作成です。先にウォレットを作成してください",
        };
      }

      const approvalId = crypto.randomUUID();
      await createApprovalRequest({
        approvalId,
        userId,
        type: "swap",
        quoteId: input.quoteId,
        expiresAt: quote.expiresAt,
        approvedContentSnapshot: {
          network: "Ethereum Sepolia",
          token: quote.fromToken,
          toToken: quote.toToken,
          amount: input.amount,
          estimatedFee: quote.estimatedFee,
        },
        signPayload: quote.signPayload,
      });
      onApprovalCreated(approvalId);

      return {
        approvalId,
        instruction:
          "確認画面をユーザーへ提示済み。ユーザーがチャットで承認しウォレットで署名するまで、これ以上の操作は不要。",
      };
    },
  });
}

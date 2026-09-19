import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import {
  getTransaction,
  listTransactionsForUser,
  type TransactionRecord,
} from "../../store/transactions.js";
import { refreshTransaction } from "../chain-status.js";

const inputSchema = z.object({
  transactionId: z
    .string()
    .optional()
    .describe("状態を確認したい取引ID。省略すると直近の取引を一覧する。"),
});

const STATE_MEANING: Record<TransactionRecord["chainState"], string> = {
  confirmed_success: "確定済み（成功）。実際の照会結果で確認済み。",
  confirmed_failed: "確定済み（失敗）。実際の照会結果で確認済み。",
  broadcast_pending:
    "送信済みだが結果は未確定。成功とも失敗とも断定してはならない。",
  unknown: "状態を確認できていない。成功とも失敗とも断定してはならない。",
};

function describe(result: {
  transaction: TransactionRecord;
  refreshError?: string;
}) {
  const t = result.transaction;
  return {
    transactionId: t.transactionId,
    type: t.type,
    txHash: t.txHash,
    chainState: t.chainState,
    meaning: STATE_MEANING[t.chainState],
    // 照会に失敗した場合は状態が古い可能性がある。
    statusMayBeStale: result.refreshError !== undefined,
  };
}

/**
 * T068: 実行結果の確認（FR-013）。返す`chainState`は、DynamoDBに保存された
 * 検証済みの値（Sera決済状態/チェーン上のレシートの照会結果のみで更新されたもの）であり、
 * LLMが生成した文章から状態を決めることはない。
 */
export function createTransactionStatusTool(userId: string) {
  return tool({
    name: "get_transaction_status",
    description:
      "swapや送金の実行結果・状態を確認する。回答では必ず返却されたchainStateをそのまま根拠にすること。broadcast_pending/unknownの取引を『成功した』と言ってはならず、statusMayBeStaleがtrueの場合は状態が古い可能性を伝えること。",
    inputSchema,
    callback: async (input) => {
      if (input.transactionId) {
        const tx = await getTransaction(input.transactionId);
        if (!tx || tx.userId !== userId) {
          return { error: "指定された取引が見つかりません" };
        }
        return describe(await refreshTransaction(tx));
      }
      const records = (await listTransactionsForUser(userId)).slice(0, 10);
      const results = await Promise.all(
        records.map((r) => refreshTransaction(r)),
      );
      return { transactions: results.map(describe) };
    },
  });
}

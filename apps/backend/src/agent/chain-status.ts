import { createPublicClient, type Hex, http } from "viem";
import { sepolia } from "viem/chains";
import {
  type ApprovalRequestRecord,
  getApprovalRequest,
} from "../store/approvals.js";
import {
  type ChainState,
  type TransactionRecord,
  updateChainState,
} from "../store/transactions.js";
import { callSeraToolSafely } from "./errors.js";
import { settlementStatus } from "./sera-tools.js";

/**
 * FR-013, 憲章 原則IV: 取引の成功・失敗は、LLMの文章ではなく
 * 実際の照会結果（Seraの決済状態 / チェーン上のレシート）のみを根拠に決める。
 */

// "unsuccessful" / "not_confirmed" のような否定形が成功語を含むため、否定接頭辞も失敗として扱う。
const FAILURE_WORDS = [
  "fail",
  "revert",
  "reject",
  "expire",
  "cancel",
  "error",
  "unsuccess",
  "not_",
  "not-",
  "unconfirmed",
  "incomplete",
];
const SUCCESS_WORDS = ["settled", "success", "confirmed", "complete", "filled"];
const PENDING_WORDS = [
  "pending",
  "broadcast",
  "submitted",
  "processing",
  "queued",
];

/**
 * `sera.settlement_status`の応答から状態を判定する。
 * 失敗語を先に判定する（"unsuccessful"等に"success"が含まれるため）。
 * 解釈できない場合は`unknown`を返し、成功とは決して見なさない。
 */
export function mapSettlementStatus(raw: unknown): ChainState {
  const first = Array.isArray(raw)
    ? raw[0]
    : ((raw as { orders?: unknown[]; trades?: unknown[] } | undefined)
        ?.orders?.[0] ??
      (raw as { trades?: unknown[] } | undefined)?.trades?.[0] ??
      raw);
  const status = String(
    (first as { status?: unknown; settlement_status?: unknown } | undefined)
      ?.settlement_status ??
      (first as { status?: unknown } | undefined)?.status ??
      "",
  ).toLowerCase();
  if (!status) return "unknown";
  if (FAILURE_WORDS.some((w) => status.includes(w))) return "confirmed_failed";
  if (SUCCESS_WORDS.some((w) => status.includes(w))) return "confirmed_success";
  if (PENDING_WORDS.some((w) => status.includes(w))) return "broadcast_pending";
  return "unknown";
}

function extractTxHash(raw: unknown): string | undefined {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const r = first as { tx_hash?: string; txHash?: string } | undefined;
  return r?.tx_hash ?? r?.txHash;
}

export interface ChainStatusDeps {
  fetchSettlement(uuid: string): Promise<unknown>;
  /** レシートが未確認（ブロック未取り込み）ならundefined。 */
  fetchReceipt(txHash: string): Promise<"success" | "reverted" | undefined>;
}

export const defaultChainStatusDeps: ChainStatusDeps = {
  fetchSettlement: (uuid) =>
    callSeraToolSafely("sera.settlement_status", () =>
      settlementStatus({ uuid }),
    ),
  async fetchReceipt(txHash) {
    const rpc = process.env.SEPOLIA_RPC_URL;
    const client = createPublicClient({ chain: sepolia, transport: http(rpc) });
    try {
      const receipt = await client.getTransactionReceipt({
        hash: txHash as Hex,
      });
      return receipt.status;
    } catch (err) {
      // レシート未取得（未マイニング）は「まだ不明」であり失敗ではない。
      if ((err as { name?: string }).name === "TransactionReceiptNotFoundError")
        return undefined;
      throw err;
    }
  },
};

export interface ChainStatusResult {
  transaction: TransactionRecord;
  /** 照会に失敗した場合の理由。この場合、状態は更新していない（推測しない）。 */
  refreshError?: string;
}

/**
 * 未確定（broadcast_pending）の取引についてのみ実状態を照会し、
 * 確定した結果（成功/失敗）が得られた場合に限りDynamoDBの状態を更新する。
 * 照会失敗・解釈不能・未確定の場合は現在の状態を保持する。
 */
export async function refreshTransaction(
  tx: TransactionRecord,
  deps: ChainStatusDeps = defaultChainStatusDeps,
): Promise<ChainStatusResult> {
  if (tx.chainState !== "broadcast_pending") return { transaction: tx };

  try {
    let next: ChainState = "unknown";
    let txHash = tx.txHash;

    if (tx.type === "swap") {
      const approval: ApprovalRequestRecord | undefined =
        await getApprovalRequest(tx.approvalId);
      if (!approval?.quoteId) return { transaction: tx };
      const raw = await deps.fetchSettlement(approval.quoteId);
      next = mapSettlementStatus(raw);
      txHash = txHash ?? extractTxHash(raw);
    } else if (tx.txHash) {
      const status = await deps.fetchReceipt(tx.txHash);
      if (status === "success") next = "confirmed_success";
      else if (status === "reverted") next = "confirmed_failed";
    }

    if (next === "confirmed_success" || next === "confirmed_failed") {
      await updateChainState(tx.transactionId, next, txHash);
      return {
        transaction: {
          ...tx,
          chainState: next,
          txHash,
          confirmedAt: new Date().toISOString(),
        },
      };
    }
    return { transaction: tx };
  } catch (err) {
    return {
      transaction: tx,
      refreshError: err instanceof Error ? err.message : String(err),
    };
  }
}

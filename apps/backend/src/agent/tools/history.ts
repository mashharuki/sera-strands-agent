import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { getWallet } from "../../store/wallets.js";
import { mapSettlementStatus } from "../chain-status.js";
import { callSeraToolSafely, toUserFacingMessage } from "../errors.js";
import { settlementStatus } from "../sera-tools.js";

export interface TradeHistoryItem {
  transactionId: string;
  type?: "swap" | "transfer";
  summary: string;
  chainState:
    | "broadcast_pending"
    | "confirmed_success"
    | "confirmed_failed"
    | "unknown";
  occurredAt?: string;
}

/**
 * T045: `sera-mcp`の`settlement_status`レスポンスは正規化されていない
 * （research.md §1.3のdocコメント）。フィールド名を推測せず、確認できる
 * 最小限の情報（trade_id/uuid, status, timestamp）のみを抽出する。
 */
export function normalizeTradeHistory(raw: unknown): TradeHistoryItem[] {
  const items = Array.isArray(raw)
    ? raw
    : ((raw as { trades?: unknown[] })?.trades ?? []);
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const record = item as Record<string, unknown>;
    const transactionId = String(
      record.trade_id ?? record.uuid ?? record.id ?? "unknown",
    );
    const rawStatus = String(record.status ?? "").toLowerCase();
    const chainState = mapSettlementStatus(record);
    return {
      transactionId,
      summary: `${record.type ?? "取引"} (${rawStatus || "状態不明"})`,
      chainState,
      occurredAt:
        typeof record.timestamp === "string" ? record.timestamp : undefined,
    };
  });
}

/** チャットから取引履歴を照会するツール。FR-005: 板情報・見積もりと混同しないこと。 */
export function createHistoryTool(userId: string) {
  return tool({
    name: "get_trade_history",
    description:
      "自分の過去の取引履歴を取得する。板情報や現在の価格見積もりとは別物であることに注意すること。",
    inputSchema: z.void(),
    callback: async () => {
      const wallet = await getWallet(userId);
      if (!wallet) return { history: [] };
      try {
        const raw = await callSeraToolSafely("sera.settlement_status", () =>
          settlementStatus({ ownerAddress: wallet.address }),
        );
        return { history: normalizeTradeHistory(raw) };
      } catch (err) {
        return { error: toUserFacingMessage(err) };
      }
    },
  });
}

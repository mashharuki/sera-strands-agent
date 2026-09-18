import type { components } from "api-spec/generated/types.js";

/**
 * contracts/openapi.yaml（正本）から生成された型（packages/api-spec/generated/types.ts）を
 * 読みやすい名前で再エクスポートする。apps/backend・apps/frontend の双方から参照する。
 */
export type Wallet = components["schemas"]["Wallet"];
export type BalanceList = components["schemas"]["BalanceList"];
export type OrderbookView = components["schemas"]["OrderbookView"];
export type Quote = components["schemas"]["Quote"];
export type TradeHistoryItem = components["schemas"]["TradeHistoryItem"];
export type ApprovalRequest = components["schemas"]["ApprovalRequest"];
export type Transaction = components["schemas"]["Transaction"];
export type ChainState = components["schemas"]["ChainState"];
export type ChatStreamEvent = components["schemas"]["ChatStreamEvent"];
export type ErrorResponse = components["schemas"]["ErrorResponse"];

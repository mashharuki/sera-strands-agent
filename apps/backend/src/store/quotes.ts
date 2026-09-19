import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, tableName } from "./client.js";

export type QuoteStatus = "issued" | "consumed" | "expired";

export interface QuoteRecord {
  quoteId: string;
  userId: string;
  fromToken: string;
  toToken: string;
  amount: string;
  estimatedRate: string;
  estimatedFee?: string;
  slippage?: string;
  expiresAt: number;
  status: QuoteStatus;
  /**
   * sera-mcpの`get_quote`が返すEIP-712 `route_params`（署名対象データ）を
   * そのまま不透明な値として保持する。正確なフィールド構造はresearch.md §1.3の
   * 通り実疎通確認ができていないため、加工・解釈をせずクライアントへ引き渡す。
   */
  signPayload?: unknown;
  /**
   * 見積もりがEIP-2612 permitの追加署名を要求する場合true。permit署名フローは
   * 未対応のため、この場合swapのprepareを拒否する（署名不足で失敗する前に明示する）。
   */
  requiresPermit?: boolean;
}

function quoteKey(quoteId: string) {
  return { pk: `QUOTE#${quoteId}`, sk: "QUOTE" };
}

/** FR-011: `expiresAt`（epoch seconds）はDynamoDB TTL属性としても機能する。 */
export async function saveQuote(quote: QuoteRecord): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: { ...quoteKey(quote.quoteId), ...quote },
    }),
  );
}

export async function getQuote(
  quoteId: string,
): Promise<QuoteRecord | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(), Key: quoteKey(quoteId) }),
  );
  return res.Item as QuoteRecord | undefined;
}

export function isQuoteExpired(quote: QuoteRecord): boolean {
  return quote.expiresAt * 1000 < Date.now();
}

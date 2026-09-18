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

import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ApprovalType } from "./approvals.js";
import { docClient, tableName } from "./client.js";

export type ChainState =
  | "broadcast_pending"
  | "confirmed_success"
  | "confirmed_failed"
  | "unknown";

export interface TransactionRecord {
  /** 1つのApprovalRequestに対して高々1つのTransactionしか生まれないため、`approvalId`をそのまま使う。 */
  transactionId: string;
  approvalId: string;
  userId: string;
  type: ApprovalType;
  txHash?: string;
  chainState: ChainState;
  broadcastAt: string;
  confirmedAt?: string;
}

function txKey(transactionId: string) {
  return { pk: `TX#${transactionId}`, sk: "TX" };
}

/** FR-013, FR-014: 初期状態は必ず`broadcast_pending`。LLM文章ではなく実際の照会結果でのみ更新する。 */
export async function createTransaction(
  input: Omit<TransactionRecord, "chainState" | "broadcastAt">,
): Promise<TransactionRecord> {
  const record: TransactionRecord = {
    ...input,
    chainState: "broadcast_pending",
    broadcastAt: new Date().toISOString(),
  };
  await docClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        ...txKey(record.transactionId),
        ...record,
        gsi1pk: `USER#${record.userId}`,
        gsi1sk: `TX#${record.broadcastAt}`,
      },
    }),
  );
  return record;
}

export async function getTransaction(
  transactionId: string,
): Promise<TransactionRecord | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(), Key: txKey(transactionId) }),
  );
  return res.Item as TransactionRecord | undefined;
}

export async function listTransactionsForUser(
  userId: string,
): Promise<TransactionRecord[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: { ":pk": `USER#${userId}` },
      ScanIndexForward: false,
    }),
  );
  return (res.Items ?? []) as TransactionRecord[];
}

/** FR-013: sera-mcpからの検証済みレスポンスのみを根拠に更新する。 */
export async function updateChainState(
  transactionId: string,
  chainState: ChainState,
  txHash?: string,
): Promise<void> {
  // confirmedAtは確定（成功/失敗）した場合にのみ記録する。
  const isTerminal =
    chainState === "confirmed_success" || chainState === "confirmed_failed";
  const sets = ["chainState = :chainState"];
  const values: Record<string, unknown> = { ":chainState": chainState };
  if (isTerminal) {
    sets.push("confirmedAt = :confirmedAt");
    values[":confirmedAt"] = new Date().toISOString();
  }
  if (txHash) {
    sets.push("txHash = :txHash");
    values[":txHash"] = txHash;
  }
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: txKey(transactionId),
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeValues: values,
    }),
  );
}

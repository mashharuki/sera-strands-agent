import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, tableName } from "./client.js";

export type ApprovalType = "swap" | "transfer";
export type ApprovalStatus =
  | "pending_confirmation"
  | "chat_approved"
  | "signed"
  | "executing"
  | "executed"
  | "cancelled"
  | "expired";

export interface ApprovedContentSnapshot {
  network: string;
  token: string;
  toToken?: string;
  amount: string;
  destinationAddress?: string;
  estimatedFee?: string;
  slippage?: string;
  /** transfer検証用: ERC-20コントラクトアドレスと最小単位の数量（FR-010） */
  tokenAddress?: string;
  rawAmount?: string;
}

export interface ApprovalRequestRecord {
  approvalId: string;
  userId: string;
  type: ApprovalType;
  quoteId?: string;
  approvedContentSnapshot: ApprovedContentSnapshot;
  status: ApprovalStatus;
  expiresAt: number;
  createdAt: string;
  updatedAt: string;
  /**
   * swap実行時にウォレットで署名すべきEIP-712ペイロード（`Quote.signPayload`から
   * コピー）。送金（transfer）の場合は`buildUnsignedTransfer`（onchain-transfer.ts）が返す未署名トランザクション
   * （T059/US5実装時に追加）。
   */
  signPayload?: unknown;
}

function approvalKey(approvalId: string) {
  return { pk: `APPROVAL#${approvalId}`, sk: "APPROVAL" };
}

export async function createApprovalRequest(
  input: Omit<ApprovalRequestRecord, "status" | "createdAt" | "updatedAt">,
): Promise<ApprovalRequestRecord> {
  const now = new Date().toISOString();
  const record: ApprovalRequestRecord = {
    ...input,
    status: "pending_confirmation",
    createdAt: now,
    updatedAt: now,
  };
  await docClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: { ...approvalKey(record.approvalId), ...record },
    }),
  );
  return record;
}

export async function getApprovalRequest(
  approvalId: string,
): Promise<ApprovalRequestRecord | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(), Key: approvalKey(approvalId) }),
  );
  return res.Item as ApprovalRequestRecord | undefined;
}

export function isApprovalExpired(approval: ApprovalRequestRecord): boolean {
  return approval.expiresAt * 1000 < Date.now();
}

export async function updateApprovalStatus(
  approvalId: string,
  status: ApprovalStatus,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: approvalKey(approvalId),
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": status,
        ":updatedAt": new Date().toISOString(),
      },
    }),
  );
}

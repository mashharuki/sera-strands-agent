import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, tableName } from "./client.js";

/**
 * FR-012: 二重クリック・再試行・タイムアウトによる二重実行を防止する。
 * 呼び出し側が生成した一意のキー（例: ApprovalRequest.approvalId）を用いて、
 * DynamoDBの条件付きPut（属性が存在しない場合のみ成功）で「一度だけ」を保証する。
 *
 * @returns true: このキーで初めて実行に進んでよい / false: 既に処理済み・処理中
 */
export async function claimIdempotencyKey(key: string): Promise<boolean> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          pk: `IDEMPOTENCY#${key}`,
          sk: "CLAIM",
          claimedAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      return false;
    }
    throw err;
  }
}

/**
 * 実行がbroadcast前に失敗した場合に呼ぶ。claim済みのキーを解放し、
 * ユーザーが同じapprovalIdで正当に再試行できるようにする
 * （例: 残高不足を解消した後の再試行）。broadcastが実際に成功した後は
 * 絶対に呼び出してはならない。
 */
export async function releaseIdempotencyKey(key: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: `IDEMPOTENCY#${key}`, sk: "CLAIM" },
    }),
  );
}

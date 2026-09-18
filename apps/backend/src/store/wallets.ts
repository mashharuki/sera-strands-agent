import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, tableName } from "./client.js";

export interface WalletRecord {
  userId: string;
  address: string;
  chainId: number;
  createdAt: string;
}

function walletKey(userId: string) {
  return { pk: `USER#${userId}`, sk: "WALLET" };
}

export async function getWallet(
  userId: string,
): Promise<WalletRecord | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(), Key: walletKey(userId) }),
  );
  return res.Item as WalletRecord | undefined;
}

export type CreateWalletResult =
  | { created: true; wallet: WalletRecord }
  | { created: false; wallet: WalletRecord };

/**
 * FR-002: 既にウォレットが存在する場合は新規作成せず既存情報を返す。
 * DynamoDBの条件付きPut（`attribute_not_exists(pk)`）で1ユーザー1ウォレット
 * （`/speckit-clarify`の決定）を保証する。
 */
export async function createWalletIfAbsent(
  userId: string,
  address: string,
  chainId: number,
): Promise<CreateWalletResult> {
  const wallet: WalletRecord = {
    userId,
    address,
    chainId,
    createdAt: new Date().toISOString(),
  };
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName(),
        Item: { ...walletKey(userId), ...wallet },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    return { created: true, wallet };
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      const existing = await getWallet(userId);
      if (!existing)
        throw new Error(
          "wallet conditional check failed but no existing record found",
        );
      return { created: false, wallet: existing };
    }
    throw err;
  }
}

import { randomUUID } from "node:crypto";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, tableName } from "./client.js";

export type ConversationRole = "user" | "assistant" | "tool";

export interface ConversationMessage {
  sessionId: string;
  messageId: string;
  userId: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
}

/** FR-018: sessionId/userIdは認証コンテキストから決定し、他ユーザーと混在しない。 */
export async function appendMessage(
  input: Omit<ConversationMessage, "messageId" | "createdAt">,
): Promise<ConversationMessage> {
  const message: ConversationMessage = {
    ...input,
    messageId: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await docClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: `SESSION#${message.sessionId}`,
        sk: `MESSAGE#${message.createdAt}#${message.messageId}`,
        ...message,
      },
    }),
  );
  return message;
}

export async function listMessages(
  sessionId: string,
  userId: string,
): Promise<ConversationMessage[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `SESSION#${sessionId}`,
        ":prefix": "MESSAGE#",
      },
    }),
  );
  const items = (res.Items ?? []) as ConversationMessage[];
  return items.filter((item) => item.userId === userId);
}

import { createAgent } from "../agent/strands-client.js";
import { createBalanceTool } from "../agent/tools/balance.js";
import { createWalletStatusTool } from "../agent/tools/wallet.js";
import { appendMessage } from "../store/conversations.js";

export type ChatStreamEvent =
  | { eventType: "token"; payload: { text: string } }
  | { eventType: "tool_call"; payload: { name: string } }
  | { eventType: "approval_required"; payload: { approvalId: string } }
  | { eventType: "error"; payload: { message: string } }
  | { eventType: "done"; payload: Record<string, never> };

export interface ChatTurnInput {
  sessionId: string;
  userId: string;
  message: string;
}

/**
 * T023: POST /chat の中核ロジック（Lambda Function URL 固有のAPIに依存しない
 * 部分）。実際のツール登録（wallet/balance/market/swap/transfer）は各ユーザー
 * ストーリー実装時に `createAgent(tools)` の tools 引数へ追加する。
 */
export async function* streamChatTurn(
  input: ChatTurnInput,
): AsyncGenerator<ChatStreamEvent> {
  await appendMessage({
    sessionId: input.sessionId,
    userId: input.userId,
    role: "user",
    content: input.message,
  });

  const agent = createAgent([
    createWalletStatusTool(input.userId),
    createBalanceTool(input.userId),
  ]);
  let assistantText = "";

  try {
    for await (const event of agent.stream(input.message)) {
      if (event.type !== "modelStreamUpdateEvent") continue;
      const modelEvent = event.event;
      if (
        modelEvent.type === "modelContentBlockDeltaEvent" &&
        modelEvent.delta.type === "textDelta"
      ) {
        assistantText += modelEvent.delta.text;
        yield { eventType: "token", payload: { text: modelEvent.delta.text } };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { eventType: "error", payload: { message } };
    return;
  }

  await appendMessage({
    sessionId: input.sessionId,
    userId: input.userId,
    role: "assistant",
    content: assistantText,
  });
  yield { eventType: "done", payload: {} };
}

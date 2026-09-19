import { toAgentHistory } from "../agent/history.js";
import { createAgent } from "../agent/strands-client.js";
import { createBalanceTool } from "../agent/tools/balance.js";
import { createHistoryTool } from "../agent/tools/history.js";
import { createOrderbookTool } from "../agent/tools/orderbook.js";
import { createQuoteTool } from "../agent/tools/quote.js";
import { createSwapIntentTool } from "../agent/tools/swap.js";
import { createTransactionStatusTool } from "../agent/tools/transaction-status.js";
import { createTransferIntentTool } from "../agent/tools/transfer.js";
import { createWalletStatusTool } from "../agent/tools/wallet.js";
import { appendMessage, listMessages } from "../store/conversations.js";

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
  // 今回の発話を保存する前に、これまでの会話を読み込む（FR-018: 自分のセッションのみ）。
  const history = toAgentHistory(
    await listMessages(input.sessionId, input.userId),
  );
  await appendMessage({
    sessionId: input.sessionId,
    userId: input.userId,
    role: "user",
    content: input.message,
  });

  const pendingApprovals: string[] = [];
  const agent = createAgent(
    [
      createWalletStatusTool(input.userId),
      createBalanceTool(input.userId),
      createQuoteTool(input.userId),
      createOrderbookTool(),
      createHistoryTool(input.userId),
      createSwapIntentTool(input.userId, (approvalId) =>
        pendingApprovals.push(approvalId),
      ),
      createTransferIntentTool(input.userId, (approvalId) =>
        pendingApprovals.push(approvalId),
      ),
      createTransactionStatusTool(input.userId),
    ],
    history,
  );
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
  for (const approvalId of pendingApprovals) {
    yield { eventType: "approval_required", payload: { approvalId } };
  }
  yield { eventType: "done", payload: {} };
}

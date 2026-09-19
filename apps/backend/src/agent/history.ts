import type { MessageData } from "@strands-agents/sdk";
import type { ConversationMessage } from "../store/conversations.js";

/** モデルに渡す過去のやり取りの最大件数（トークン量とコストの上限）。 */
const MAX_HISTORY_MESSAGES = 20;

/**
 * 保存済みの会話（DynamoDB）を、Strandsエージェントの`messages`へ変換する。
 * - 保存しているのはテキストだけ（ツール呼び出しの中身は含まない）。見積もりIDなど後続の
 *   操作に必要な値は、アシスタントの返答テキストに含めさせる（システムプロンプトで指示）。
 * - Bedrockのモデルは「user始まり・user/assistant交互」を要求するため、空の発話を捨て、
 *   同じ役割が続く場合は結合し、先頭のassistantと末尾のuserは取り除く
 *   （末尾のuserは、失敗したターンで返答が保存されなかったもの。今回のuser発話と重なるため）。
 */
export function toAgentHistory(messages: ConversationMessage[]): MessageData[] {
  const recent = messages
    .filter((m) => m.role !== "tool" && m.content.trim() !== "")
    .slice(-MAX_HISTORY_MESSAGES);

  const merged: { role: "user" | "assistant"; text: string }[] = [];
  for (const m of recent) {
    const role = m.role === "assistant" ? "assistant" : "user";
    const last = merged[merged.length - 1];
    if (last?.role === role) last.text += `\n${m.content}`;
    else merged.push({ role, text: m.content });
  }

  while (merged[0]?.role === "assistant") merged.shift();
  while (merged[merged.length - 1]?.role === "user") merged.pop();

  return merged.map((m) => ({ role: m.role, content: [{ text: m.text }] }));
}

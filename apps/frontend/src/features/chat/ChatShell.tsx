import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useRef, useState } from "react";
import type { ChatStreamEvent } from "shared";
import { useSessionStore } from "../../store/session.ts";

interface ChatLine {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/**
 * T029: 基本チャットUIシェル。POST /chat（Lambda Function URL、NDJSONストリーミング）を
 * 逐次パースして表示する。swap/送金の確認UI（approval_required）は各ストーリー実装時に追加する。
 */
export function ChatShell() {
  const { getAccessToken } = usePrivy();
  const sessionId = useSessionStore((s) => s.sessionId);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const nextId = useRef(0);

  const sendMessage = useCallback(async () => {
    const message = input.trim();
    if (!message || isStreaming) return;
    setInput("");
    const userLineId = String(nextId.current++);
    setLines((prev) => [
      ...prev,
      { id: userLineId, role: "user", text: message },
    ]);

    const assistantLineId = String(nextId.current++);
    setLines((prev) => [
      ...prev,
      { id: assistantLineId, role: "assistant", text: "" },
    ]);
    setIsStreaming(true);

    try {
      const token = await getAccessToken();
      const chatUrl = import.meta.env.VITE_CHAT_URL as string | undefined;
      if (!chatUrl) throw new Error("VITE_CHAT_URL is not set");

      const res = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId, message }),
      });
      if (!res.body) throw new Error("no response body");

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          if (!line) continue;
          const event = JSON.parse(line) as ChatStreamEvent;
          if (event.eventType === "token") {
            const text = (event.payload as unknown as { text: string }).text;
            setLines((prev) =>
              prev.map((l) =>
                l.id === assistantLineId ? { ...l, text: l.text + text } : l,
              ),
            );
          }
        }
      }
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, getAccessToken, sessionId]);

  return (
    <div className="chat-shell">
      <div className="chat-messages">
        {lines.map((line) => (
          <div key={line.id} className={`chat-line chat-line--${line.role}`}>
            {line.text}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ウォレットを作成して、など"
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>
          送信
        </button>
      </form>
    </div>
  );
}

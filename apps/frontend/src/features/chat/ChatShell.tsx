import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStreamEvent } from "shared";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useSessionStore } from "../../store/session.ts";
import { ApprovalConfirm } from "../transactions/ApprovalConfirm.tsx";
import { MessageContent } from "./MessageContent.tsx";

interface ChatLine {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/**
 * T029/T057: 基本チャットUIシェル。POST /chat（Lambda Function URL、NDJSONストリーミング）を
 * 逐次パースして表示する。`approval_required`イベントを受け取るとSwapConfirmを表示する（FR-008, FR-009）。
 */
export function ChatShell() {
  const { getAccessToken } = usePrivy();
  const { locale, t } = useI18n();
  const sessionId = useSessionStore((s) => s.sessionId);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(
    null,
  );
  const nextId = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lines.length > 0 || pendingApprovalId !== null) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lines, pendingApprovalId]);

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

    const showAssistantText = (text: string) =>
      setLines((prev) =>
        prev.map((l) => (l.id === assistantLineId ? { ...l, text } : l)),
      );

    try {
      const token = await getAccessToken();
      const chatUrl = import.meta.env.VITE_CHAT_URL as string | undefined;
      if (!chatUrl) throw new Error("VITE_CHAT_URL is not set");

      const res = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Accept-Language": locale,
        },
        body: JSON.stringify({ sessionId, message, locale }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`${t("chat.requestFailed")} (HTTP ${res.status})`);
      }

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
          if (event.eventType === "error") {
            const { message: errorMessage } = event.payload as unknown as {
              message?: string;
            };
            showAssistantText(
              `${t("chat.error")}: ${errorMessage ?? t("chat.unknownError")}`,
            );
          }
          if (event.eventType === "approval_required") {
            const { approvalId } = event.payload as unknown as {
              approvalId: string;
            };
            setPendingApprovalId(approvalId);
          }
        }
      }
    } catch (error) {
      // 通信失敗などを画面に出す（黙って何も表示しない状態にしない）。
      console.error("[chat] request failed", error);
      showAssistantText(
        `${t("chat.error")}: ${
          error instanceof Error ? error.message : t("chat.connectionFailed")
        }`,
      );
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, getAccessToken, sessionId, locale, t]);

  const quickPrompts = [
    t("chat.promptBalance"),
    t("chat.promptQuote"),
    t("chat.promptHistory"),
  ];

  return (
    <div className="chat-shell">
      <div className="chat-messages">
        {lines.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty__symbol" aria-hidden="true">
              S
            </div>
            <p className="eyebrow">{t("chat.eyebrow")}</p>
            <h2>{t("chat.title")}</h2>
            <p>{t("chat.description")}</p>
            <div className="quick-prompts">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {lines.map((line) => (
          <div key={line.id} className={`chat-line chat-line--${line.role}`}>
            <span className="chat-line__avatar" aria-hidden="true">
              {line.role === "assistant" ? "S" : "YOU"}
            </span>
            <div className="chat-line__content">
              <span className="chat-line__author">
                {line.role === "assistant" ? "Sera" : t("chat.you")}
              </span>
              <MessageContent
                text={line.text || (isStreaming ? t("chat.thinking") : "")}
              />
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {pendingApprovalId && (
        <ApprovalConfirm
          approvalId={pendingApprovalId}
          onDone={() => setPendingApprovalId(null)}
        />
      )}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          placeholder={t("chat.placeholder")}
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>
          <span>{t("chat.send")}</span>
          <span aria-hidden="true">↑</span>
        </button>
        <small>{t("chat.hint")}</small>
      </form>
    </div>
  );
}

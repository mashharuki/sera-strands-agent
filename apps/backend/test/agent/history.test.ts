import { describe, expect, it } from "vitest";
import { toAgentHistory } from "../../src/agent/history";
import type { ConversationMessage } from "../../src/store/conversations";

let n = 0;
const msg = (
  role: ConversationMessage["role"],
  content: string,
): ConversationMessage => ({
  sessionId: "s",
  messageId: String(n++),
  userId: "u",
  role,
  content,
  createdAt: new Date(n * 1000).toISOString(),
});

const texts = (h: ReturnType<typeof toAgentHistory>) =>
  h.map((m) => [m.role, (m.content[0] as { text: string }).text]);

describe("toAgentHistory", () => {
  it("should convert a normal alternating conversation to agent messages", () => {
    const h = toAgentHistory([
      msg("user", "見積もり"),
      msg("assistant", "見積もりID: q1"),
    ]);
    expect(texts(h)).toEqual([
      ["user", "見積もり"],
      ["assistant", "見積もりID: q1"],
    ]);
  });

  it("should drop empty and tool messages", () => {
    const h = toAgentHistory([
      msg("user", "a"),
      msg("tool", "ignored"),
      msg("assistant", "   "),
      msg("assistant", "b"),
    ]);
    expect(texts(h)).toEqual([
      ["user", "a"],
      ["assistant", "b"],
    ]);
  });

  it("should merge consecutive messages from the same role", () => {
    const h = toAgentHistory([
      msg("user", "a"),
      msg("user", "b"),
      msg("assistant", "c"),
    ]);
    expect(texts(h)).toEqual([
      ["user", "a\nb"],
      ["assistant", "c"],
    ]);
  });

  it("should start with a user message and end with an assistant message", () => {
    const h = toAgentHistory([
      msg("assistant", "orphan"),
      msg("user", "q"),
      msg("assistant", "a"),
      msg("user", "unanswered"),
    ]);
    expect(texts(h)).toEqual([
      ["user", "q"],
      ["assistant", "a"],
    ]);
  });

  it("should keep only the most recent messages", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", `m${i}`),
    );
    const h = toAgentHistory(many);
    expect(h.length).toBeLessThanOrEqual(20);
    expect(h[0].role).toBe("user");
  });

  it("should return an empty history when there is nothing usable", () => {
    expect(toAgentHistory([])).toEqual([]);
    expect(toAgentHistory([msg("user", "only")])).toEqual([]);
  });
});

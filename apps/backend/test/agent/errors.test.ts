import { describe, expect, it } from "vitest";
import { SeraToolError, toUserFacingMessage } from "../../src/agent/errors";

describe("toUserFacingMessage", () => {
  it("should include the reason when sera-mcp reported an input error", () => {
    const err = new SeraToolError(
      'sera-mcpツール "sera.get_quote" の呼び出しに失敗しました',
      new Error(
        'Error in sera.get_quote: Could not resolve "MTRY" to a Sera token.',
      ),
    );
    const msg = toUserFacingMessage(err);
    expect(msg).toContain('Could not resolve "MTRY"');
    expect(msg).not.toContain("通信でエラー");
  });

  it("should keep the generic message for transport failures", () => {
    const err = new SeraToolError(
      "x",
      new Error("Streamable HTTP error: Error POSTing to endpoint: "),
    );
    const msg = toUserFacingMessage(err);
    expect(msg).toContain("外部サービス（Sera Protocol）との通信でエラー");
    expect(msg).not.toContain("Streamable");
  });

  it("should truncate very long tool errors", () => {
    const err = new SeraToolError(
      "x",
      new Error(`Error in sera.get_quote: ${"a".repeat(1000)}`),
    );
    expect(toUserFacingMessage(err).length).toBeLessThan(500);
  });

  it("should use the unexpected-error message for non-Sera errors", () => {
    expect(toUserFacingMessage(new Error("boom"))).toContain("予期しない");
  });
});

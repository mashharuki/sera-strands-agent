import { describe, expect, it } from "vitest";
import { classifyMarketIntent } from "../../src/agent/tools/market-router.js";

describe("classifyMarketIntent (FR-005: 板/見積もり/履歴を混同しない)", () => {
  it("should classify order book questions as orderbook", () => {
    expect(classifyMarketIntent("USDC/USDTの板情報を教えて")).toBe("orderbook");
  });

  it("should classify price/rate questions as quote", () => {
    expect(classifyMarketIntent("USDCをUSDTに交換したらいくら?")).toBe("quote");
  });

  it("should classify trade history questions as history", () => {
    expect(classifyMarketIntent("これまでの取引履歴を見せて")).toBe("history");
  });

  it("should not classify an orderbook question as a quote or history", () => {
    const result = classifyMarketIntent("板を見せて");
    expect(result).not.toBe("quote");
    expect(result).not.toBe("history");
  });

  it("should return unknown for unrelated messages", () => {
    expect(classifyMarketIntent("こんにちは")).toBe("unknown");
  });
});

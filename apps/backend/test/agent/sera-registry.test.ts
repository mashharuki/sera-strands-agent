import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchSeraTokens,
  parseTokenRegistry,
  resetTokenRegistryCache,
} from "../../src/agent/sera-registry";

const ADDR = "0x965d4b4546716e416e950bc30467d128455d2d0e";
const body = {
  tokens: [{ symbol: "USDC", address: ADDR, decimals: 6, extra: 1 }],
};

const okFetch = (b: unknown) =>
  vi.fn(
    async () => new Response(JSON.stringify(b), { status: 200 }),
  ) as unknown as typeof fetch;

describe("parseTokenRegistry", () => {
  it("should keep well-formed tokens and drop malformed ones", () => {
    const parsed = parseTokenRegistry({
      tokens: [
        { symbol: "USDC", address: ADDR, decimals: 6 },
        { symbol: "BAD", address: "not-an-address", decimals: 6 },
        { symbol: "NODEC", address: ADDR },
      ],
    });
    expect(parsed).toEqual([{ symbol: "USDC", address: ADDR, decimals: 6 }]);
  });

  it("should throw when the response has no usable tokens", () => {
    expect(() => parseTokenRegistry({ tokens: [] })).toThrow();
    expect(() => parseTokenRegistry({})).toThrow();
  });
});

describe("fetchSeraTokens", () => {
  beforeEach(() => resetTokenRegistryCache());

  it("should cache the registry between calls within the TTL", async () => {
    const f = okFetch(body);
    await fetchSeraTokens(f, () => 0);
    await fetchSeraTokens(f, () => 1000);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("should refetch after the TTL expires", async () => {
    const f = okFetch(body);
    await fetchSeraTokens(f, () => 0);
    await fetchSeraTokens(f, () => 11 * 60 * 1000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("should throw on a non-OK response", async () => {
    const f = vi.fn(
      async () => new Response("", { status: 503 }),
    ) as unknown as typeof fetch;
    await expect(fetchSeraTokens(f, () => 0)).rejects.toThrow(/503/);
  });
});

import { describe, expect, it } from "vitest";
import {
  type BalanceReader,
  readOnchainBalances,
  type TokenInfo,
} from "../../src/agent/onchain-balances";

const OWNER = "0x1111111111111111111111111111111111111111";
const USDC: TokenInfo = {
  symbol: "USDC",
  address: "0x2222222222222222222222222222222222222222",
  decimals: 6,
};
const USDT: TokenInfo = {
  symbol: "USDT",
  address: "0x3333333333333333333333333333333333333333",
  decimals: 6,
};
const XSGD: TokenInfo = {
  symbol: "XSGD",
  address: "0x4444444444444444444444444444444444444444",
  decimals: 6,
};

const tokens = async () => [USDC, USDT, XSGD];

const reader = (
  balances: (bigint | undefined)[],
  overrides: Partial<BalanceReader> = {},
): BalanceReader => ({
  getEthBalance: async () => 1_500_000_000_000_000_000n,
  getTokenBalances: async () => balances,
  ...overrides,
});

describe("readOnchainBalances", () => {
  it("should always include ETH and only tokens with a positive balance", async () => {
    const res = await readOnchainBalances(
      OWNER,
      tokens,
      reader([12_340_000n, 0n, 0n]),
    );
    expect(res.balances).toEqual([
      { token: "ETH", amount: "1.5", decimals: 18 },
      { token: "USDC", amount: "12.34", decimals: 6 },
    ]);
    expect(res.checked_tokens).toBe(3);
    expect(res.unreadable_tokens).toEqual([]);
  });

  it("should include USDT when the wallet holds it (registry-wide, not a fixed list)", async () => {
    const res = await readOnchainBalances(
      OWNER,
      tokens,
      reader([0n, 5_000_000n, 0n]),
    );
    expect(res.balances.map((b) => b.token)).toEqual(["ETH", "USDT"]);
  });

  it("should report tokens it could not read instead of treating them as zero", async () => {
    const res = await readOnchainBalances(
      OWNER,
      tokens,
      reader([0n, undefined, 0n]),
    );
    expect(res.unreadable_tokens).toEqual(["USDT"]);
  });

  it("should limit the check to BALANCE_SYMBOLS when it is set", async () => {
    process.env.BALANCE_SYMBOLS = "usdc, xsgd";
    try {
      let seen: string[] = [];
      const res = await readOnchainBalances(
        OWNER,
        tokens,
        reader([], {
          getTokenBalances: async (_o, ts) => {
            seen = ts.map((t) => t.symbol);
            return ts.map(() => 0n);
          },
        }),
      );
      expect(seen).toEqual(["USDC", "XSGD"]);
      expect(res.checked_tokens).toBe(2);
    } finally {
      delete process.env.BALANCE_SYMBOLS;
    }
  });

  it("should reject an invalid owner address when the input is not a hex address", async () => {
    await expect(
      readOnchainBalances("0xabc", tokens, reader([])),
    ).rejects.toThrow(/invalid owner/);
  });

  it("should propagate RPC failures instead of reporting a zero balance", async () => {
    const failing = reader([], {
      getEthBalance: async () => {
        throw new Error("rpc down");
      },
    });
    await expect(readOnchainBalances(OWNER, tokens, failing)).rejects.toThrow(
      "rpc down",
    );
  });
});

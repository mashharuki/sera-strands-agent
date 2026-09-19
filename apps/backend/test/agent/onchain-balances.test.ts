import { describe, expect, it } from "vitest";
import {
  type BalanceReader,
  readOnchainBalances,
} from "../../src/agent/onchain-balances";

const OWNER = "0x1111111111111111111111111111111111111111";
const USDC = {
  symbol: "USDC",
  address: "0x2222222222222222222222222222222222222222",
  decimals: 6,
};

const resolve = async (symbol: string) =>
  symbol === "USDC" ? USDC : undefined;

const reader = (overrides: Partial<BalanceReader> = {}): BalanceReader => ({
  getEthBalance: async () => 1_500_000_000_000_000_000n,
  getTokenBalance: async () => 12_340_000n,
  ...overrides,
});

describe("readOnchainBalances", () => {
  it("should return ETH and resolved token balances formatted by decimals", async () => {
    const res = await readOnchainBalances(OWNER, resolve, reader());
    expect(res.balances).toEqual([
      { token: "ETH", amount: "1.5", decimals: 18 },
      { token: "USDC", amount: "12.34", decimals: 6 },
    ]);
  });

  it("should skip symbols that Sera does not know when the registry lookup finds nothing", async () => {
    const res = await readOnchainBalances(
      OWNER,
      async () => undefined,
      reader(),
    );
    expect(res.balances.map((b) => b.token)).toEqual(["ETH"]);
  });

  it("should reject an invalid owner address when the input is not a hex address", async () => {
    await expect(
      readOnchainBalances("0xabc", resolve, reader()),
    ).rejects.toThrow(/invalid owner/);
  });

  it("should propagate RPC failures instead of reporting a zero balance", async () => {
    const failing = reader({
      getTokenBalance: async () => {
        throw new Error("rpc down");
      },
    });
    await expect(readOnchainBalances(OWNER, resolve, failing)).rejects.toThrow(
      "rpc down",
    );
  });
});

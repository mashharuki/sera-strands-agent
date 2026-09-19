import { decodeFunctionData, erc20Abi } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  broadcastSignedTransfer,
  buildUnsignedTransfer,
  type ChainClient,
} from "../../src/agent/onchain-transfer";

const FROM = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const TO = "0x3333333333333333333333333333333333333333";

const client = (overrides: Partial<ChainClient> = {}): ChainClient => ({
  getNonce: async () => 7,
  estimateGas: async () => 50_000n,
  estimateFees: async () => ({
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  }),
  sendRaw: async () => "0xabc",
  ...overrides,
});

describe("buildUnsignedTransfer", () => {
  it("should encode an ERC-20 transfer to the token contract with zero native value", async () => {
    const tx = await buildUnsignedTransfer(
      { tokenAddress: TOKEN, to: TO, rawAmount: "1500000", from: FROM },
      client(),
    );
    expect(tx.to).toBe(TOKEN);
    expect(tx.value).toBe("0x0");
    expect(tx.chainId).toBe(11155111);
    expect(tx.nonce).toBe(7);
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: tx.data as `0x${string}`,
    });
    expect(decoded.functionName).toBe("transfer");
    expect(decoded.args).toEqual([TO, 1500000n]);
  });

  it("should add a gas buffer on top of the estimate", async () => {
    const tx = await buildUnsignedTransfer(
      { tokenAddress: TOKEN, to: TO, rawAmount: "1", from: FROM },
      client({ estimateGas: async () => 100_000n }),
    );
    expect(BigInt(tx.gasLimit)).toBe(120_000n);
  });

  it("should fail instead of returning a partial tx when gas estimation fails", async () => {
    await expect(
      buildUnsignedTransfer(
        { tokenAddress: TOKEN, to: TO, rawAmount: "1", from: FROM },
        client({
          estimateGas: async () => {
            throw new Error("execution reverted");
          },
        }),
      ),
    ).rejects.toThrow("execution reverted");
  });
});

describe("broadcastSignedTransfer", () => {
  it("should return the transaction hash from the RPC", async () => {
    const sendRaw = vi.fn(async () => "0x1234" as const);
    const res = await broadcastSignedTransfer("0x02aa", client({ sendRaw }));
    expect(sendRaw).toHaveBeenCalledWith("0x02aa");
    expect(res).toEqual({ tx_hash: "0x1234" });
  });
});

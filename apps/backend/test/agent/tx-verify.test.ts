import { encodeFunctionData, erc20Abi, parseGwei } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { verifySignedTransfer } from "../../src/agent/tx-verify.js";

const account = privateKeyToAccount(generatePrivateKey());
const attacker = privateKeyToAccount(generatePrivateKey());
const TOKEN = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";

async function signTransfer(opts: {
  signer?: typeof account;
  to?: string;
  amount?: bigint;
  contract?: string;
}) {
  const signer = opts.signer ?? account;
  return signer.signTransaction({
    type: "eip1559",
    chainId: 11155111,
    nonce: 0,
    gas: 100000n,
    maxFeePerGas: parseGwei("20"),
    maxPriorityFeePerGas: parseGwei("1"),
    to: (opts.contract ?? TOKEN) as `0x${string}`,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [(opts.to ?? RECIPIENT) as `0x${string}`, opts.amount ?? 1000000n],
    }),
  });
}

const expected = {
  tokenAddress: TOKEN,
  recipient: RECIPIENT,
  rawAmount: "1000000",
  from: account.address,
};

describe("verifySignedTransfer (FR-010: 承認内容と実行内容の一致)", () => {
  it("should accept a transfer that matches the approved content", async () => {
    const raw = await signTransfer({});
    expect(await verifySignedTransfer(raw, expected)).toEqual({ ok: true });
  });

  it("should reject a transfer whose recipient differs from the approval", async () => {
    const raw = await signTransfer({ to: OTHER });
    const result = await verifySignedTransfer(raw, expected);
    expect(result.ok).toBe(false);
  });

  it("should reject a transfer whose amount differs from the approval", async () => {
    const raw = await signTransfer({ amount: 9999999n });
    const result = await verifySignedTransfer(raw, expected);
    expect(result.ok).toBe(false);
  });

  it("should reject a transfer sent to a different token contract", async () => {
    const raw = await signTransfer({ contract: OTHER });
    const result = await verifySignedTransfer(raw, expected);
    expect(result.ok).toBe(false);
  });

  it("should reject a transaction signed by someone other than the user's wallet", async () => {
    const raw = await signTransfer({ signer: attacker });
    const result = await verifySignedTransfer(raw, expected);
    expect(result.ok).toBe(false);
  });

  it("should reject garbage input instead of throwing", async () => {
    const result = await verifySignedTransfer("0xdeadbeef", expected);
    expect(result.ok).toBe(false);
  });
});

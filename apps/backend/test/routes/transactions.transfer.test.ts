import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { encodeFunctionData, erc20Abi, parseGwei } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { docClient } from "../../src/store/client.js";

process.env.PRIVY_APP_ID = "test-app-id";
process.env.PRIVY_VERIFICATION_KEY = "test-verification-key";
process.env.TABLE_NAME = "test-table";

vi.mock("@privy-io/node", () => ({
  verifyAccessToken: vi.fn(async () => ({ user_id: "user-a" })),
}));

const sendTransferCalls: unknown[] = [];
vi.mock("../../src/agent/sera-mcp-client.js", () => ({
  callSeraTool: vi.fn(async (toolName: string, args: unknown) => {
    if (toolName === "sera.get_balances") {
      return {
        balances: [
          { token: "USDC", amount: "100" },
          { token: "ETH", amount: "1" },
        ],
      };
    }
    if (toolName === "sera.send_transfer") {
      sendTransferCalls.push(args);
      return { tx_hash: "0xtxhash" };
    }
    throw new Error(`unexpected tool ${toolName}`);
  }),
  readSeraResource: vi.fn(),
}));

const { app } = await import("../../src/index.js");
const ddbMock = mockClient(docClient);

const user = privateKeyToAccount(generatePrivateKey());
const TOKEN = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const ATTACKER_DEST = "0x3333333333333333333333333333333333333333";
const nowSec = () => Math.floor(Date.now() / 1000);

function signTransfer(to: string) {
  return user.signTransaction({
    type: "eip1559",
    chainId: 11155111,
    nonce: 0,
    gas: 100000n,
    maxFeePerGas: parseGwei("20"),
    maxPriorityFeePerGas: parseGwei("1"),
    to: TOKEN,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [to as `0x${string}`, 1000000n],
    }),
  });
}

function approvalItem(overrides: Record<string, unknown> = {}) {
  return {
    approvalId: "appr-t1",
    userId: "user-a",
    type: "transfer",
    status: "pending_confirmation",
    expiresAt: nowSec() + 60,
    approvedContentSnapshot: {
      network: "Ethereum Sepolia",
      token: "USDC",
      amount: "1",
      destinationAddress: RECIPIENT,
      tokenAddress: TOKEN,
      rawAmount: "1000000",
    },
    ...overrides,
  };
}

function mockLookups(approval = approvalItem(), txExists = false) {
  ddbMock.on(GetCommand).callsFake((input: { Key: { pk: string } }) => {
    const pk = input.Key.pk;
    if (pk.startsWith("APPROVAL#")) return { Item: approval };
    if (pk.startsWith("USER#"))
      return {
        Item: { userId: "user-a", address: user.address, chainId: 11155111 },
      };
    if (pk.startsWith("TX#") && txExists)
      return {
        Item: { transactionId: "appr-t1", chainState: "broadcast_pending" },
      };
    return {};
  });
  ddbMock.on(UpdateCommand).resolves({});
}

function confirm(rawTx: string) {
  return app.request("/transactions/transfer/confirm", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify({ approvalId: "appr-t1", signature: rawTx }),
  });
}

describe("POST /transactions/transfer/confirm", () => {
  beforeEach(() => {
    ddbMock.reset();
    sendTransferCalls.length = 0;
  });

  it("should send the transfer only once when confirm is called twice (FR-012, SC-005)", async () => {
    const claimed = new Set<string>();
    ddbMock.on(PutCommand).callsFake((input: { Item: { pk: string } }) => {
      const pk = input.Item.pk;
      if (pk.startsWith("IDEMPOTENCY#")) {
        if (claimed.has(pk))
          throw new ConditionalCheckFailedException({
            message: "exists",
            $metadata: {},
          });
        claimed.add(pk);
      }
      return {};
    });
    const raw = await signTransfer(RECIPIENT);

    mockLookups();
    expect((await confirm(raw)).status).toBe(202);

    mockLookups(approvalItem(), true);
    expect((await confirm(raw)).status).toBe(202);

    expect(sendTransferCalls).toHaveLength(1);
  });

  it("should reject an expired approval with 409 without sending (FR-011)", async () => {
    mockLookups(approvalItem({ expiresAt: nowSec() - 10 }));
    const res = await confirm(await signTransfer(RECIPIENT));
    expect(res.status).toBe(409);
    expect(sendTransferCalls).toHaveLength(0);
  });

  it("should refuse to send when the signed tx differs from the approved content (FR-010)", async () => {
    ddbMock.on(PutCommand).resolves({});
    mockLookups();
    const res = await confirm(await signTransfer(ATTACKER_DEST));
    const body = (await res.json()) as { code: string };
    expect(res.status).toBe(400);
    expect(body.code).toBe("CONTENT_MISMATCH");
    expect(sendTransferCalls).toHaveLength(0);
  });
});

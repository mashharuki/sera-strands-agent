import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { docClient } from "../../src/store/client.js";
import { permitFor, signPermit } from "../helpers/permit";

process.env.PRIVY_APP_ID = "test-app-id";
process.env.PRIVY_VERIFICATION_KEY =
  "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----";
process.env.TABLE_NAME = "test-table";

vi.mock("@privy-io/node", () => ({
  verifyAccessToken: vi.fn(async () => ({ user_id: "user-a" })),
}));

const executeSwapCalls: unknown[] = [];
vi.mock("../../src/agent/sera-mcp-client.js", () => ({
  callSeraTool: vi.fn(async (toolName: string, args: unknown) => {
    if (toolName === "sera.execute_swap") {
      executeSwapCalls.push(args);
      return { tx_hash: "0xtxhash" };
    }
    throw new Error(`unexpected tool ${toolName}`);
  }),
}));

vi.mock("../../src/agent/onchain-balances.js", () => ({
  readOnchainBalances: vi.fn(async () => ({
    balances: [
      { token: "USDC", amount: "100", decimals: 6 },
      { token: "ETH", amount: "1", decimals: 18 },
    ],
  })),
}));

const { app } = await import("../../src/index.js");
const userWallet = privateKeyToAccount(generatePrivateKey());
const attacker = privateKeyToAccount(generatePrivateKey());
const ddbMock = mockClient(docClient);

const nowSec = () => Math.floor(Date.now() / 1000);

function approvalItem(overrides: Record<string, unknown> = {}) {
  return {
    approvalId: "appr-1",
    userId: "user-a",
    type: "swap",
    quoteId: "quote-1",
    status: "pending_confirmation",
    expiresAt: nowSec() + 60,
    approvedContentSnapshot: {
      network: "Ethereum Sepolia",
      token: "USDC",
      toToken: "USDT",
      amount: "10",
    },
    ...overrides,
  };
}

function quoteItem(overrides: Record<string, unknown> = {}) {
  return {
    quoteId: "quote-1",
    userId: "user-a",
    expiresAt: nowSec() + 60,
    ...overrides,
  };
}

function mockLookups(opts: {
  approval?: Record<string, unknown>;
  quote?: Record<string, unknown>;
  walletAddress?: string;
}) {
  ddbMock.on(GetCommand).callsFake((input: { Key: { pk: string } }) => {
    const pk = input.Key.pk;
    if (pk.startsWith("APPROVAL#"))
      return { Item: opts.approval ?? approvalItem() };
    if (pk.startsWith("QUOTE#")) return { Item: opts.quote ?? quoteItem() };
    if (pk.startsWith("USER#"))
      return {
        Item: {
          userId: "user-a",
          address: opts.walletAddress ?? "0xUserA",
          chainId: 11155111,
        },
      };
    return {};
  });
  ddbMock.on(UpdateCommand).resolves({});
}

function confirm(extra: Record<string, unknown> = {}) {
  return app.request("/transactions/swap/confirm", {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify({
      approvalId: "appr-1",
      signature: "0xsig",
      ...extra,
    }),
  });
}

describe("POST /transactions/swap/confirm with EIP-2612 permit", () => {
  beforeEach(() => {
    ddbMock.reset();
    executeSwapCalls.length = 0;
  });

  it("should reject and not execute when the permit signature is missing", async () => {
    const permit = permitFor(userWallet.address);
    mockLookups({
      approval: approvalItem({ permitPayload: permit }),
      walletAddress: userWallet.address,
    });
    ddbMock.on(PutCommand).resolves({});

    const res = await confirm();

    expect(res.status).toBe(400);
    expect(executeSwapCalls).toHaveLength(0);
  });

  it("should reject a permit signed by someone else without calling Sera", async () => {
    const permit = permitFor(userWallet.address);
    mockLookups({
      approval: approvalItem({ permitPayload: permit }),
      walletAddress: userWallet.address,
    });
    ddbMock.on(PutCommand).resolves({});

    const res = await confirm({
      permitSignature: await signPermit(attacker, permit),
    });

    expect(res.status).toBe(400);
    expect(executeSwapCalls).toHaveLength(0);
  });

  it("should forward the verified permit signature and its deadline to Sera", async () => {
    const permit = permitFor(userWallet.address);
    const permitSignature = await signPermit(userWallet, permit);
    mockLookups({
      approval: approvalItem({ permitPayload: permit }),
      walletAddress: userWallet.address,
    });
    ddbMock.on(PutCommand).resolves({});

    const res = await confirm({ permitSignature });

    expect(res.status).toBe(202);
    expect(executeSwapCalls).toEqual([
      {
        uuid: "quote-1",
        signature: "0xsig",
        permit_signature: permitSignature,
        permit_deadline: 1_900_000_000,
      },
    ]);
  });
});

describe("POST /transactions/swap/confirm", () => {
  beforeEach(() => {
    ddbMock.reset();
    executeSwapCalls.length = 0;
  });

  it("should execute the swap only once when confirm is called twice for the same approvalId (FR-012, SC-005)", async () => {
    mockLookups({});
    // 冪等性キーのPutのみ「初回成功・以降は条件付きPut失敗」とする（DynamoDBの実挙動を模擬）
    const claimed = new Set<string>();
    ddbMock.on(PutCommand).callsFake((input: { Item: { pk: string } }) => {
      const pk = input.Item.pk;
      if (pk.startsWith("IDEMPOTENCY#")) {
        if (claimed.has(pk)) {
          throw new ConditionalCheckFailedException({
            message: "exists",
            $metadata: {},
          });
        }
        claimed.add(pk);
      }
      return {};
    });

    const first = await confirm();
    expect(first.status).toBe(202);

    // 2回目: 既に実行済みとしてTransactionが取得できる状態
    ddbMock.on(GetCommand).callsFake((input: { Key: { pk: string } }) => {
      const pk = input.Key.pk;
      if (pk.startsWith("APPROVAL#")) return { Item: approvalItem() };
      if (pk.startsWith("QUOTE#")) return { Item: quoteItem() };
      if (pk.startsWith("USER#"))
        return {
          Item: { userId: "user-a", address: "0xUserA", chainId: 11155111 },
        };
      if (pk.startsWith("TX#"))
        return {
          Item: {
            transactionId: "appr-1",
            approvalId: "appr-1",
            chainState: "broadcast_pending",
          },
        };
      return {};
    });
    const second = await confirm();
    expect(second.status).toBe(202);

    expect(executeSwapCalls).toHaveLength(1);
  });

  it("should not execute and should return faucet guidance when gas (ETH) balance is zero (FR-016, FR-020)", async () => {
    mockLookups({});
    const { readOnchainBalances } = await import(
      "../../src/agent/onchain-balances.js"
    );
    vi.mocked(readOnchainBalances).mockImplementationOnce(async () => ({
      owner_address: "0xowner",
      balances: [{ token: "USDC", amount: "100", decimals: 6 }],
      checked_tokens: 1,
      unreadable_tokens: [],
    }));

    const res = await confirm();
    const body = (await res.json()) as { code: string; message: string };

    expect(res.status).toBe(400);
    expect(body.code).toBe("INSUFFICIENT_BALANCE");
    expect(body.message).toContain("faucet");
    expect(executeSwapCalls).toHaveLength(0);
  });

  it("should reject confirm with 409 when the quote has expired (FR-011)", async () => {
    mockLookups({ quote: quoteItem({ expiresAt: nowSec() - 10 }) });

    const res = await confirm();

    expect(res.status).toBe(409);
    expect(executeSwapCalls).toHaveLength(0);
  });
});

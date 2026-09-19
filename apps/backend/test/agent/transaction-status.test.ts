import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChainStatusDeps,
  mapSettlementStatus,
  refreshTransaction,
} from "../../src/agent/chain-status.js";
import { docClient } from "../../src/store/client.js";
import type { TransactionRecord } from "../../src/store/transactions.js";

process.env.TABLE_NAME = "test-table";

vi.mock("../../src/agent/sera-mcp-client.js", () => ({
  callSeraTool: vi.fn(),
  readSeraResource: vi.fn(),
}));

const ddbMock = mockClient(docClient);

const pendingSwap: TransactionRecord = {
  transactionId: "appr-1",
  approvalId: "appr-1",
  userId: "user-a",
  type: "swap",
  chainState: "broadcast_pending",
  broadcastAt: "2026-01-01T00:00:00.000Z",
};
const pendingTransfer: TransactionRecord = {
  ...pendingSwap,
  transactionId: "appr-2",
  approvalId: "appr-2",
  type: "transfer",
  txHash: "0xabc",
};

function deps(over: Partial<ChainStatusDeps>): ChainStatusDeps {
  return {
    fetchSettlement: vi.fn(async () => []),
    fetchReceipt: vi.fn(async () => undefined),
    checkSwap: vi.fn(async () => "not_found" as const),
    ...over,
  };
}

function updates() {
  return ddbMock.commandCalls(UpdateCommand);
}

describe("mapSettlementStatus", () => {
  it("should treat failure words as failure even when they contain 'success'", () => {
    expect(mapSettlementStatus([{ status: "unsuccessful" }])).toBe(
      "confirmed_failed",
    );
  });

  it("should map settled to confirmed_success", () => {
    expect(mapSettlementStatus([{ status: "SETTLED" }])).toBe(
      "confirmed_success",
    );
  });

  it("should never treat an unrecognized or missing status as success", () => {
    expect(mapSettlementStatus([{ status: "weird_state" }])).toBe("unknown");
    expect(mapSettlementStatus([])).toBe("unknown");
    expect(mapSettlementStatus(undefined)).toBe("unknown");
    expect(mapSettlementStatus({ message: "swap succeeded!" })).toBe("unknown");
  });
});

describe("refreshTransaction (FR-013: 実際の照会結果のみを根拠にする)", () => {
  beforeEach(() => {
    ddbMock.reset();
    ddbMock.on(UpdateCommand).resolves({});
    ddbMock.on(GetCommand).resolves({
      Item: { approvalId: "appr-1", quoteId: "quote-1" },
    });
  });

  it("should mark a swap confirmed only when Sera reports a settled status", async () => {
    const result = await refreshTransaction(
      pendingSwap,
      deps({
        fetchSettlement: vi.fn(async () => [
          { status: "settled", tx_hash: "0xhash" },
        ]),
      }),
    );

    expect(result.transaction.chainState).toBe("confirmed_success");
    expect(result.transaction.txHash).toBe("0xhash");
    expect(updates()).toHaveLength(1);
  });

  it("should NOT change the state when the status lookup fails, and report it (FR-014, FR-017)", async () => {
    const result = await refreshTransaction(
      pendingSwap,
      deps({
        fetchSettlement: vi.fn(async () => {
          throw new Error("sera down");
        }),
      }),
    );

    expect(result.transaction.chainState).toBe("broadcast_pending");
    expect(result.refreshError).toContain("sera down");
    expect(updates()).toHaveLength(0);
  });

  it("should NOT mark success when the response is unrecognized", async () => {
    const result = await refreshTransaction(
      pendingSwap,
      deps({ fetchSettlement: vi.fn(async () => [{ status: "weird_state" }]) }),
    );

    expect(result.transaction.chainState).toBe("broadcast_pending");
    expect(updates()).toHaveLength(0);
  });

  it("should keep a transfer pending while its receipt is not yet available", async () => {
    const result = await refreshTransaction(
      pendingTransfer,
      deps({ fetchReceipt: vi.fn(async () => undefined) }),
    );

    expect(result.transaction.chainState).toBe("broadcast_pending");
    expect(updates()).toHaveLength(0);
  });

  it("should confirm a transfer from the on-chain receipt (success and reverted)", async () => {
    const ok = await refreshTransaction(
      pendingTransfer,
      deps({ fetchReceipt: vi.fn(async () => "success" as const) }),
    );
    const bad = await refreshTransaction(
      pendingTransfer,
      deps({ fetchReceipt: vi.fn(async () => "reverted" as const) }),
    );

    expect(ok.transaction.chainState).toBe("confirmed_success");
    expect(bad.transaction.chainState).toBe("confirmed_failed");
  });

  it("should not query anything for a transaction that is already confirmed", async () => {
    const fetchSettlement = vi.fn(async () => []);
    const done: TransactionRecord = {
      ...pendingSwap,
      chainState: "confirmed_success",
    };

    const result = await refreshTransaction(done, deps({ fetchSettlement }));

    expect(result.transaction).toBe(done);
    expect(fetchSettlement).not.toHaveBeenCalled();
  });

  it("should record confirmedAt only for terminal states", async () => {
    await refreshTransaction(
      pendingTransfer,
      deps({ fetchReceipt: vi.fn(async () => "success" as const) }),
    );

    const input = updates()[0].args[0].input as { UpdateExpression: string };
    expect(input.UpdateExpression).toContain("confirmedAt");
  });
});

describe("refreshTransaction: swap（オンチェーンのTransferログで確認、APIキー不要）", () => {
  const evidence = {
    taker: "0x1111111111111111111111111111111111111111",
    inputToken: "0x2222222222222222222222222222222222222222",
    outputToken: "0x3333333333333333333333333333333333333333",
    maxInputAmount: "10000000",
    minOutputAmount: "600000",
    recipient: "0x1111111111111111111111111111111111111111",
    deadline: Math.floor(Date.now() / 1000) + 3600,
  };
  const swapWithEvidence = (
    deadline = evidence.deadline,
  ): TransactionRecord => ({
    ...pendingSwap,
    swapEvidence: { ...evidence, deadline },
  });

  beforeEach(() => {
    ddbMock.reset();
    ddbMock.on(UpdateCommand).resolves({});
    ddbMock.on(GetCommand).resolves({});
  });

  it("should confirm success when the on-chain transfers match the signed quote", async () => {
    const fetchSettlement = vi.fn(async () => []);
    const result = await refreshTransaction(
      swapWithEvidence(),
      deps({
        checkSwap: vi.fn(async () => "settled" as const),
        fetchSettlement,
      }),
    );
    expect(result.transaction.chainState).toBe("confirmed_success");
    expect(updates()).toHaveLength(1);
    // 認証付きのSera APIは使わない
    expect(fetchSettlement).not.toHaveBeenCalled();
  });

  it("should stay pending when nothing is found yet and the deadline has not passed", async () => {
    const result = await refreshTransaction(swapWithEvidence(), deps({}));
    expect(result.transaction.chainState).toBe("broadcast_pending");
    expect(updates()).toHaveLength(0);
  });

  it("should stay pending shortly after the deadline to allow for indexing delay", async () => {
    const justExpired = Math.floor(Date.now() / 1000) - 60;
    const result = await refreshTransaction(
      swapWithEvidence(justExpired),
      deps({}),
    );
    expect(result.transaction.chainState).toBe("broadcast_pending");
  });

  it("should confirm failure when nothing settled well after the signed deadline", async () => {
    const longExpired = Math.floor(Date.now() / 1000) - 3600;
    const result = await refreshTransaction(
      swapWithEvidence(longExpired),
      deps({}),
    );
    expect(result.transaction.chainState).toBe("confirmed_failed");
  });

  it("should surface an RPC failure without changing the state", async () => {
    const result = await refreshTransaction(
      swapWithEvidence(),
      deps({
        checkSwap: vi.fn(async () => {
          throw new Error("rpc down");
        }),
      }),
    );
    expect(result.transaction.chainState).toBe("broadcast_pending");
    expect(result.refreshError).toContain("rpc down");
    expect(updates()).toHaveLength(0);
  });

  it("should recover the evidence from the approval's signed payload for swaps recorded before this feature", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        approvalId: "appr-1",
        userId: "user-a",
        quoteId: "q1",
        signPayload: {
          message: {
            taker: evidence.taker,
            inputToken: evidence.inputToken,
            outputToken: evidence.outputToken,
            maxInputAmount: evidence.maxInputAmount,
            minOutputAmount: evidence.minOutputAmount,
            recipient: evidence.recipient,
            deadline: evidence.deadline,
          },
        },
      },
    });
    const checkSwap = vi.fn(async () => "settled" as const);
    const result = await refreshTransaction(pendingSwap, deps({ checkSwap }));
    expect(checkSwap).toHaveBeenCalledTimes(1);
    expect(result.transaction.chainState).toBe("confirmed_success");
  });
});

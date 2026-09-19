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

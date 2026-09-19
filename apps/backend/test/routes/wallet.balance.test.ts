import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { docClient } from "../../src/store/client.js";

process.env.PRIVY_APP_ID = "test-app-id";
process.env.PRIVY_VERIFICATION_KEY =
  "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----";
process.env.TABLE_NAME = "test-table";

vi.mock("@privy-io/node", () => ({
  verifyAccessToken: vi.fn(
    async ({ access_token }: { access_token: string }) => {
      if (access_token === "token-for-user-a") return { user_id: "user-a" };
      if (access_token === "token-for-user-b") return { user_id: "user-b" };
      throw new Error("invalid token");
    },
  ),
}));

const balanceCallLog: string[] = [];
vi.mock("../../src/agent/onchain-balances.js", () => ({
  readOnchainBalances: vi.fn(async (owner: string) => {
    balanceCallLog.push(owner);
    return { balances: [{ token: "USDC", amount: "10", decimals: 6 }] };
  }),
}));
vi.mock("../../src/agent/sera-mcp-client.js", () => ({
  callSeraTool: vi.fn(),
  readSeraResource: vi.fn(),
}));

const { app } = await import("../../src/index.js");

const ddbMock = mockClient(docClient);

describe("GET /wallet/balance", () => {
  beforeEach(() => {
    ddbMock.reset();
    balanceCallLog.length = 0;
  });

  it("should return 404 and suggest wallet creation when the user has no wallet (FR-003)", async () => {
    ddbMock.resolves({ Item: undefined });

    const res = await app.request("/wallet/balance", {
      headers: { Authorization: "Bearer token-for-user-a" },
    });

    expect(res.status).toBe(404);
  });

  it("should only ever query the caller's own wallet address, never one supplied by the request (FR-004)", async () => {
    ddbMock.resolves({
      Item: { userId: "user-a", address: "0xUserAAddress", chainId: 11155111 },
    });

    const res = await app.request(
      "/wallet/balance?address=0xSomeoneElsesAddress",
      {
        headers: { Authorization: "Bearer token-for-user-a" },
      },
    );

    expect(res.status).toBe(200);
    expect(balanceCallLog).toEqual(["0xUserAAddress"]);
    // OpenAPI契約どおり、balancesは配列で返す（画面が map するため）
    const body = (await res.json()) as { balances: unknown };
    expect(Array.isArray(body.balances)).toBe(true);
  });
});

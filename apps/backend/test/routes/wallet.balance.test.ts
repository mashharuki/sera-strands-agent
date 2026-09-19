import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { docClient } from "../../src/store/client.js";

process.env.PRIVY_APP_ID = "test-app-id";
process.env.PRIVY_VERIFICATION_KEY = "test-verification-key";
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

const seraCallLog: Array<{ toolName: string; args: Record<string, unknown> }> =
  [];
vi.mock("../../src/agent/sera-mcp-client.js", () => ({
  callSeraTool: vi.fn(
    async (toolName: string, args: Record<string, unknown>) => {
      seraCallLog.push({ toolName, args });
      return { balances: [{ token: "USDC", amount: "10" }] };
    },
  ),
}));

const { app } = await import("../../src/index.js");

const ddbMock = mockClient(docClient);

describe("GET /wallet/balance", () => {
  beforeEach(() => {
    ddbMock.reset();
    seraCallLog.length = 0;
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
    expect(seraCallLog).toHaveLength(1);
    expect(seraCallLog[0].toolName).toBe("sera.get_balances");
    expect(seraCallLog[0].args.owner_address).toBe("0xUserAAddress");
  });
});

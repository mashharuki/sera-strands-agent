import { describe, expect, it } from "vitest";

process.env.PRIVY_APP_ID = "test-app-id";
process.env.PRIVY_VERIFICATION_KEY = "test-verification-key";

const { app } = await import("../../src/index.js");

describe("GET/POST /wallet auth guard", () => {
  it("should reject unauthenticated requests with 401 (FR-019)", async () => {
    const res = await app.request("/wallet");
    expect(res.status).toBe(401);
  });

  it("should reject unauthenticated wallet creation with 401 (FR-019)", async () => {
    const res = await app.request("/wallet?address=0xabc", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

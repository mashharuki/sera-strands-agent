import { describe, expect, it } from "vitest";

process.env.PRIVY_APP_ID = "test-app-id";
process.env.PRIVY_VERIFICATION_KEY =
  "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----";

const { app } = await import("../../src/index.js");

describe("CORS preflight", () => {
  it("should answer OPTIONS without authentication when the browser sends a preflight", async () => {
    const res = await app.request("/wallet", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.cloudfront.net",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-headers")).toMatch(
      /authorization/i,
    );
  });

  it("should still reject unauthenticated GET requests when CORS is enabled", async () => {
    const res = await app.request("/wallet", {
      headers: { Origin: "https://example.cloudfront.net" },
    });
    expect(res.status).toBe(401);
  });
});

import { describe, expect, it } from "vitest";

process.env.PRIVY_APP_ID = "test-app-id";
// App Secretを検証キーに誤設定したケース（形式が公開鍵PEMではない）
process.env.PRIVY_VERIFICATION_KEY = "privy_app_secret_dummy";

const { app } = await import("../../src/index.js");

describe("auth configuration guard", () => {
  it("should fail closed with AUTH_NOT_CONFIGURED when the verification key is not a PEM public key", async () => {
    const res = await app.request("/wallet", {
      headers: { Authorization: "Bearer dummy" },
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("AUTH_NOT_CONFIGURED");
  });
});

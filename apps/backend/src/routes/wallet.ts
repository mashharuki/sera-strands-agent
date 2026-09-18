import { Hono } from "hono";
import type { AuthedVariables } from "../auth/privy.js";
import { createWalletIfAbsent, getWallet } from "../store/wallets.js";

export const walletRoutes = new Hono<{ Variables: AuthedVariables }>();

/** FR-001, FR-002: 冪等なウォレット作成。契約(contracts/openapi.yaml)通り既存時は200、新規時は201。 */
walletRoutes.post("/wallet", async (c) => {
  const userId = c.get("userId");
  const address = c.req.query("address");
  const chainId = Number(c.req.query("chainId") ?? 11155111);
  if (!address) {
    return c.json(
      {
        code: "INVALID_REQUEST",
        message:
          "address is required (Privy embedded walletが発行したアドレス)",
      },
      400,
    );
  }
  const result = await createWalletIfAbsent(userId, address, chainId);
  return c.json(result.wallet, result.created ? 201 : 200);
});

/** FR-003: 自分のウォレット情報を取得する。 */
walletRoutes.get("/wallet", async (c) => {
  const userId = c.get("userId");
  const wallet = await getWallet(userId);
  if (!wallet) {
    return c.json(
      { code: "NOT_FOUND", message: "ウォレットが未作成です" },
      404,
    );
  }
  return c.json(wallet, 200);
});

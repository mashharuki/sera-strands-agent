import { callSeraToolSafely } from "./errors.js";
import { getBalances } from "./sera-tools.js";

export type BalanceCheckResult =
  | { ok: true }
  | { ok: false; reason: "insufficient_token"; token: string }
  | { ok: false; reason: "insufficient_gas" };

interface RawBalanceEntry {
  token?: string;
  symbol?: string;
  amount?: string | number;
}

/**
 * FR-016, FR-020: swap・送金の実行前に、対象トークンとネットワーク手数料(ガス代)の
 * 残高を確認する。残高はオンチェーンから読む（onchain-balances.ts）ため、応答は`token`と`amount`を持つ。ガス代トークンは`ETH`という名前を仮定する
 * （Ethereum Sepolia想定）。この前提は実装フェーズでの実疎通確認が必要。
 */
export async function checkSufficientBalance(
  address: string,
  token: string,
  amount: string,
): Promise<BalanceCheckResult> {
  const raw = (await callSeraToolSafely("onchain.get_balances", () =>
    getBalances(address),
  )) as { balances?: RawBalanceEntry[] } | RawBalanceEntry[];

  const balances = Array.isArray(raw) ? raw : (raw.balances ?? []);

  const tokenEntry = balances.find(
    (b) => (b.token ?? b.symbol)?.toUpperCase() === token.toUpperCase(),
  );
  const tokenAmount = Number(tokenEntry?.amount ?? 0);
  if (!(tokenAmount >= Number(amount))) {
    return { ok: false, reason: "insufficient_token", token };
  }

  const gasEntry = balances.find(
    (b) => (b.token ?? b.symbol)?.toUpperCase() === "ETH",
  );
  const gasAmount = Number(gasEntry?.amount ?? 0);
  if (!(gasAmount > 0)) {
    return { ok: false, reason: "insufficient_gas" };
  }

  return { ok: true };
}

export const FAUCET_GUIDANCE =
  "Sepolia ETH（ネットワーク手数料）が不足しています。Sepoliaの公開faucet（例: https://sepoliafaucet.com ）から入手してください。";

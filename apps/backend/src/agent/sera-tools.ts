import { readOnchainBalances } from "./onchain-balances.js";
import { callSeraTool, readSeraResource } from "./sera-mcp-client.js";

/**
 * sera-mcp(v1) の実ツール名・引数に対する型付きラッパー。
 * 根拠: sera-cx/sera-mcp @ d6f50c1a の src/tools/registry.ts・schemas.ts・core.ts
 * （ツール名は `sera.` 接頭辞付き）。応答フィールドのうち実コードで確認できたものだけを型にし、
 * 確認できないものは `unknown` として呼び出し側に解釈させる。
 */

export interface SeraQuote {
  uuid: string;
  route_params: Record<string, unknown>;
  fee_breakdown?: unknown;
  expires_at?: string | number;
  /** 非nullの場合はEIP-2612 permitの追加署名が必要（現状未対応）。 */
  permit?: unknown | null;
  from?: { symbol: string; address: string; decimals: number };
  to?: { symbol: string; address: string; decimals: number };
  human?: { input?: string; min_output?: string };
}

/**
 * 残高はオンチェーンから読む（`sera.get_balances`はAPI Key必須のため。onchain-balances.ts参照）。
 * 戻り値は `{ balances: [{ token, amount, decimals }] }`。
 */
export const getBalances = (ownerAddress: string) =>
  readOnchainBalances(ownerAddress, resolveToken);

/** `owner_address`は非simulateの見積もりでは必須（core.ts getQuote）。 */
export const getQuote = (args: {
  from: string;
  to: string;
  amount: string;
  ownerAddress: string;
}) =>
  callSeraTool("sera.get_quote", {
    from: args.from,
    to: args.to,
    amount: args.amount,
    owner_address: args.ownerAddress,
  }) as Promise<SeraQuote>;

export const executeSwap = (uuid: string, signature: string) =>
  callSeraTool("sera.execute_swap", { uuid, signature });

/** 実際の板ではなく、見積もりの多点プローブによる合成板（registry.ts sera.infer_book）。 */
export const inferBook = (base: string, quote: string) =>
  callSeraTool("sera.infer_book", { base, quote });

export const settlementStatus = (args: {
  ownerAddress?: string;
  uuid?: string;
  tradeId?: string;
  limit?: number;
}) =>
  callSeraTool("sera.settlement_status", {
    owner_address: args.ownerAddress,
    uuid: args.uuid,
    trade_id: args.tradeId,
    limit: args.limit,
  });

export const getCoinMetadata = (symbol: string) =>
  callSeraTool("sera.get_coin_metadata", { symbol });

const INTENT_TYPES = {
  Intent: [
    { name: "taker", type: "address" },
    { name: "inputToken", type: "address" },
    { name: "outputToken", type: "address" },
    { name: "maxInputAmount", type: "uint256" },
    { name: "minOutputAmount", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "initialDepositAmount", type: "uint256" },
    { name: "uuid", type: "uint256" },
    { name: "deadline", type: "uint48" },
  ],
} as const;

/**
 * ウォレットで署名すべきEIP-712 typed dataを組み立てる。
 * `route_params`はIntentのmessage部分のみなので、domain（`sera://config`の
 * `eip712_domain`）とtypes（sera-mcp signer.tsのINTENT_TYPES）を合成する。
 */
export async function buildSwapTypedData(routeParams: Record<string, unknown>) {
  const config = (await readSeraResource("sera://config")) as {
    eip712_domain?: Record<string, unknown>;
  };
  if (!config?.eip712_domain) {
    throw new Error("sera://config に eip712_domain が含まれていません");
  }
  const domain = config.eip712_domain;
  const domainFields = [
    ["name", "string"],
    ["version", "string"],
    ["chainId", "uint256"],
    ["verifyingContract", "address"],
  ]
    .filter(([name]) => name in domain)
    .map(([name, type]) => ({ name, type }));

  return {
    domain,
    types: { EIP712Domain: domainFields, ...INTENT_TYPES },
    primaryType: "Intent",
    message: routeParams,
  };
}

export interface ResolvedToken {
  symbol: string;
  address: string;
  decimals: number;
}

/**
 * `sera.get_coin_metadata`の応答（registryのsymbol/address/decimals）をシンボルから解決する。
 * 応答のネスト形状は実疎通で未確認のため、トップレベル・`coin`・`token`のいずれにも対応する。
 * 解決できない場合はundefined（＝未対応トークンとして扱う）。
 */
export async function resolveToken(
  symbol: string,
): Promise<ResolvedToken | undefined> {
  const raw = (await getCoinMetadata(symbol)) as
    | Record<string, unknown>
    | undefined;
  const meta = (raw?.coin ?? raw?.token ?? raw) as
    | Record<string, unknown>
    | undefined;
  const address = meta?.address;
  const decimals = Number(meta?.decimals);
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address))
    return undefined;
  if (!Number.isInteger(decimals)) return undefined;
  return { symbol: String(meta?.symbol ?? symbol), address, decimals };
}

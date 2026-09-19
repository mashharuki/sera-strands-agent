import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
} from "viem";
import { sepolia } from "viem/chains";

export type OnchainBalance = {
  /** UI/既存コードが参照するキー（シンボル）。 */
  token: string;
  amount: string;
  decimals: number;
};

export type BalancesResult = {
  owner_address: string;
  /** ETH（0でも常に含む）と、残高が0より大きいSeraトークン。 */
  balances: OnchainBalance[];
  /** 調べたSeraトークンの数（残高0のものは`balances`から省いている）。 */
  checked_tokens: number;
  /** 残高を読み取れなかったトークンのシンボル（0とは限らない）。 */
  unreadable_tokens: string[];
};

export type TokenInfo = { symbol: string; address: string; decimals: number };

export type BalanceReader = {
  getEthBalance: (owner: `0x${string}`) => Promise<bigint>;
  /** 入力と同じ順序で返す。読み取れなかったトークンは undefined。 */
  getTokenBalances: (
    owner: `0x${string}`,
    tokens: TokenInfo[],
  ) => Promise<(bigint | undefined)[]>;
};

function defaultReader(): BalanceReader {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is not set");
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  return {
    getEthBalance: (owner) => client.getBalance({ address: owner }),
    // 全トークンをMulticall3で1回のRPCにまとめる。1件の失敗で全体を落とさない。
    getTokenBalances: async (owner, tokens) => {
      const results = await client.multicall({
        allowFailure: true,
        contracts: tokens.map((t) => ({
          address: t.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [owner] as const,
        })),
      });
      return results.map((r) =>
        r.status === "success" ? (r.result as bigint) : undefined,
      );
    },
  };
}

/**
 * ウォレット残高をチェーンから直接読む（ETH + Seraに登録された全トークン）。
 *
 * sera-mcpの`sera.get_balances`はSeraの認証付きAPI（`/balances`、API Key必須。認証なしだと401を
 * 実確認）を使うため、資格情報なしでも動くようオンチェーンで読む。ウォレット保有分のみで、
 * SeraのVault内残高は含まない。対象トークンはSeraのレジストリ（`GET /tokens`）から取得する。
 * 残高0のトークンは結果から省き（150種類ほどあるため）、読み取れなかったものは0扱いにせず
 * `unreadable_tokens`で明示する。`BALANCE_SYMBOLS`（カンマ区切り）で対象を絞れる。
 */
export async function readOnchainBalances(
  owner: string,
  getTokens: () => Promise<TokenInfo[]>,
  reader: BalanceReader = defaultReader(),
): Promise<BalancesResult> {
  if (!isAddress(owner)) throw new Error(`invalid owner address: ${owner}`);
  const wanted = (process.env.BALANCE_SYMBOLS ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const all = await getTokens();
  const tokens =
    wanted.length > 0
      ? all.filter((t) => wanted.includes(t.symbol.toUpperCase()))
      : all;

  const [eth, raw] = await Promise.all([
    reader.getEthBalance(owner),
    reader.getTokenBalances(owner, tokens),
  ]);

  const balances: OnchainBalance[] = [
    { token: "ETH", amount: formatUnits(eth, 18), decimals: 18 },
  ];
  const unreadable: string[] = [];
  tokens.forEach((t, i) => {
    const value = raw[i];
    if (value === undefined) unreadable.push(t.symbol);
    else if (value > 0n) {
      balances.push({
        token: t.symbol,
        amount: formatUnits(value, t.decimals),
        decimals: t.decimals,
      });
    }
  });

  return {
    owner_address: owner,
    balances,
    checked_tokens: tokens.length,
    unreadable_tokens: unreadable,
  };
}

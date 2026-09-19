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

export type TokenInfo = { symbol: string; address: string; decimals: number };

export type BalanceReader = {
  getEthBalance: (owner: `0x${string}`) => Promise<bigint>;
  getTokenBalance: (
    token: `0x${string}`,
    owner: `0x${string}`,
  ) => Promise<bigint>;
};

/** 残高を表示するSeraのトークン。`BALANCE_SYMBOLS`（カンマ区切り）で上書きできる。 */
const DEFAULT_SYMBOLS = ["USDC", "XSGD", "MYRT"];

function defaultReader(): BalanceReader {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is not set");
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  return {
    getEthBalance: (owner) => client.getBalance({ address: owner }),
    getTokenBalance: (token, owner) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      }),
  };
}

/**
 * ウォレット残高をチェーンから直接読む（ETH + Seraのトークン）。
 *
 * sera-mcpの`sera.get_balances`はSeraの認証付きAPI（`/balances`、API Key必須。認証なしだと401を
 * 実確認）を使うため、資格情報なしでも動くようオンチェーンで読む。ウォレット保有分のみで、
 * SeraのVault内残高は含まない。トークンのアドレス/decimalsはSeraのレジストリ
 * （`sera.get_coin_metadata`）から解決し、未対応のシンボルは表示しない。
 * 読み取りに失敗したトークンを0として扱わないよう、失敗は例外にする。
 */
export async function readOnchainBalances(
  owner: string,
  resolveToken: (symbol: string) => Promise<TokenInfo | undefined>,
  reader: BalanceReader = defaultReader(),
): Promise<{ owner_address: string; balances: OnchainBalance[] }> {
  if (!isAddress(owner)) throw new Error(`invalid owner address: ${owner}`);
  const symbols = (process.env.BALANCE_SYMBOLS ?? DEFAULT_SYMBOLS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const tokens = (
    await Promise.all(symbols.map((s) => resolveToken(s)))
  ).filter((t): t is TokenInfo => t !== undefined);

  const [eth, ...rest] = await Promise.all([
    reader.getEthBalance(owner),
    ...tokens.map((t) =>
      reader.getTokenBalance(t.address as `0x${string}`, owner),
    ),
  ]);

  return {
    owner_address: owner,
    balances: [
      { token: "ETH", amount: formatUnits(eth, 18), decimals: 18 },
      ...tokens.map((t, i) => ({
        token: t.symbol,
        amount: formatUnits(rest[i], t.decimals),
        decimals: t.decimals,
      })),
    ],
  };
}

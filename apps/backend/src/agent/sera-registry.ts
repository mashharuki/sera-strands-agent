/**
 * Sera のトークンレジストリ（公開エンドポイント `GET /tokens`、認証不要）。
 * sera-mcp の `sera.get_coin_metadata` は1シンボルずつしか引けないため、
 * 残高のように「全トークンを調べたい」用途ではレジストリを直接取得する。
 */

export type RegistryToken = {
  symbol: string;
  address: string;
  decimals: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

let cache: { at: number; tokens: RegistryToken[] } | undefined;

function apiBaseUrl(): string {
  if (process.env.SERA_API_BASE_URL) return process.env.SERA_API_BASE_URL;
  return process.env.SERA_NETWORK === "mainnet"
    ? "https://api.sera.cx/api/v1"
    : "https://api-testnet.sera.cx/api/v1";
}

/** 応答の形を検証し、想定外の要素は捨てる。1件も解釈できなければ例外。 */
export function parseTokenRegistry(body: unknown): RegistryToken[] {
  const list = (body as { tokens?: unknown } | undefined)?.tokens;
  if (!Array.isArray(list))
    throw new Error("unexpected /tokens response shape");
  const tokens = list.flatMap((t): RegistryToken[] => {
    const { symbol, address, decimals } = (t ?? {}) as Record<string, unknown>;
    if (typeof symbol !== "string" || typeof address !== "string") return [];
    if (!ADDRESS_PATTERN.test(address)) return [];
    if (typeof decimals !== "number" || !Number.isInteger(decimals)) return [];
    return [{ symbol, address, decimals }];
  });
  if (tokens.length === 0)
    throw new Error("no usable tokens in /tokens response");
  return tokens;
}

export async function fetchSeraTokens(
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<RegistryToken[]> {
  if (cache && now() - cache.at < CACHE_TTL_MS) return cache.tokens;
  const res = await fetchFn(`${apiBaseUrl()}/tokens`);
  if (!res.ok) throw new Error(`Sera /tokens returned HTTP ${res.status}`);
  const tokens = parseTokenRegistry(await res.json());
  cache = { at: now(), tokens };
  return tokens;
}

export function resetTokenRegistryCache(): void {
  cache = undefined;
}

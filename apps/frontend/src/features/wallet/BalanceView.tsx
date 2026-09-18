import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "../../services/apiClient.ts";
import { useSessionStore } from "../../store/session.ts";

/** T040: US2のUI。自分のウォレット残高を表示する（読み取り専用）。 */
export function BalanceView() {
  const { getAccessToken } = usePrivy();
  const wallet = useSessionStore((s) => s.wallet);

  const balanceQuery = useQuery({
    queryKey: ["wallet-balance"],
    enabled: !!wallet,
    queryFn: async () => {
      const client = createApiClient(getAccessToken);
      const { data, error } = await client.GET("/wallet/balance", {});
      if (error) throw new Error("残高の取得に失敗しました");
      return data;
    },
  });

  if (!wallet) return null;
  if (balanceQuery.isLoading)
    return <div className="balance-view">残高を確認中...</div>;
  if (balanceQuery.isError) {
    return (
      <div className="balance-view balance-view--error">
        残高を取得できませんでした
      </div>
    );
  }

  const balances =
    (balanceQuery.data?.balances as
      | { token?: string; amount?: string }[]
      | undefined) ?? [];

  return (
    <div className="balance-view">
      <h3>残高</h3>
      {balances.length === 0 ? (
        <p>保有トークンはありません</p>
      ) : (
        <ul>
          {balances.map((b) => (
            <li key={b.token}>
              {b.token}: {b.amount}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

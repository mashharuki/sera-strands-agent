import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { createApiClient } from "../../services/apiClient.ts";
import { useSessionStore } from "../../store/session.ts";

/** T040: US2のUI。自分のウォレット残高を表示する（読み取り専用）。 */
export function BalanceView() {
  const { getAccessToken } = usePrivy();
  const { t } = useI18n();
  const wallet = useSessionStore((s) => s.wallet);

  const balanceQuery = useQuery({
    queryKey: ["wallet-balance"],
    enabled: !!wallet,
    queryFn: async () => {
      const client = createApiClient(getAccessToken);
      const { data, error } = await client.GET("/wallet/balance", {});
      if (error) throw new Error(t("balance.error"));
      return data;
    },
  });

  if (!wallet) return null;
  if (balanceQuery.isLoading)
    return (
      <div className="balance-view balance-view--loading">
        {t("balance.loading")}
      </div>
    );
  if (balanceQuery.isError) {
    return (
      <div className="balance-view balance-view--error">
        {t("balance.error")}
      </div>
    );
  }

  const rawBalances: unknown = balanceQuery.data?.balances;
  const balances = Array.isArray(rawBalances)
    ? (rawBalances as { token?: string; amount?: string }[])
    : [];

  return (
    <div className="balance-view">
      <div className="balance-view__header">
        <h3>{t("balance.title")}</h3>
        <span>{t("balance.assets", { count: balances.length })}</span>
      </div>
      {balances.length === 0 ? (
        <p>{t("balance.empty")}</p>
      ) : (
        <ul>
          {balances.map((b) => (
            <li key={b.token}>
              <span className="balance-view__token-mark">
                {(b.token ?? "?").slice(0, 1)}
              </span>
              <span className="balance-view__token">{b.token}</span>
              <strong>{b.amount}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

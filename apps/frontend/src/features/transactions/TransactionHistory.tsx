import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { type TranslationKey, useI18n } from "../../i18n/I18nProvider.tsx";
import { createApiClient } from "../../services/apiClient.ts";

const STATE_LABEL: Record<string, TranslationKey> = {
  confirmed_success: "transactions.success",
  confirmed_failed: "transactions.failed",
  broadcast_pending: "transactions.pending",
  unknown: "transactions.unknown",
};

const POLL_INTERVAL_MS = 10_000;

/**
 * T069: US6のUI。実行済みのswap・送金の状態一覧（FR-015）。
 * 「送信済み・結果確定待ち」を成功・失敗と明確に区別して表示し（FR-014）、
 * 未確定の取引がある間は定期的に再取得する。最新状態の照会に失敗した取引は
 * 古い可能性を警告する。
 */
export function TransactionHistory() {
  const { getAccessToken } = usePrivy();
  const { t } = useI18n();

  const query = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const client = createApiClient(getAccessToken);
      const { data, error } = await client.GET("/transactions", {});
      if (error || !data) throw new Error(t("transactions.error"));
      return data;
    },
    refetchInterval: (q) =>
      q.state.data?.some((t) => t.chainState === "broadcast_pending")
        ? POLL_INTERVAL_MS
        : false,
  });

  if (query.isLoading)
    return (
      <div className="tx-history">
        <h3>{t("transactions.title")}</h3>
        <p>{t("transactions.loading")}</p>
      </div>
    );
  if (query.isError) {
    return (
      <div className="tx-history tx-history--error">
        <h3>{t("transactions.title")}</h3>
        <p>{t("transactions.error")}</p>
      </div>
    );
  }

  const items = query.data ?? [];
  if (items.length === 0) {
    return (
      <div className="tx-history">
        <h3>{t("transactions.title")}</h3>
        <p>{t("transactions.empty")}</p>
      </div>
    );
  }

  return (
    <div className="tx-history">
      <h3>{t("transactions.title")}</h3>
      <ul>
        {items.map((transaction) => (
          <li
            key={transaction.transactionId}
            className={`tx-history__item tx-history__item--${transaction.chainState}`}
          >
            <strong>
              {transaction.type === "swap"
                ? "swap"
                : t("transactions.transfer")}
            </strong>{" "}
            <span>
              {STATE_LABEL[transaction.chainState]
                ? t(STATE_LABEL[transaction.chainState])
                : transaction.chainState}
            </span>
            {transaction.txHash && (
              <>
                {" "}
                <code>{transaction.txHash}</code>
              </>
            )}
            {transaction.statusCheckError && (
              <p className="tx-history__warning">{t("transactions.stale")}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

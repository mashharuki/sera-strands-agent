import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "../../services/apiClient.ts";

const STATE_LABEL: Record<string, string> = {
  confirmed_success: "確定（成功）",
  confirmed_failed: "確定（失敗）",
  broadcast_pending: "送信済み・結果確定待ち",
  unknown: "状態不明",
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

  const query = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const client = createApiClient(getAccessToken);
      const { data, error } = await client.GET("/transactions", {});
      if (error || !data) throw new Error("取引履歴の取得に失敗しました");
      return data;
    },
    refetchInterval: (q) =>
      q.state.data?.some((t) => t.chainState === "broadcast_pending")
        ? POLL_INTERVAL_MS
        : false,
  });

  if (query.isLoading) return <div className="tx-history">取引を確認中...</div>;
  if (query.isError) {
    return (
      <div className="tx-history tx-history--error">
        取引履歴を取得できませんでした
      </div>
    );
  }

  const items = query.data ?? [];
  if (items.length === 0) {
    return <div className="tx-history">実行済みの取引はまだありません</div>;
  }

  return (
    <div className="tx-history">
      <h3>取引履歴</h3>
      <ul>
        {items.map((t) => (
          <li
            key={t.transactionId}
            className={`tx-history__item tx-history__item--${t.chainState}`}
          >
            <strong>{t.type === "swap" ? "swap" : "送金"}</strong>{" "}
            <span>{STATE_LABEL[t.chainState] ?? t.chainState}</span>
            {t.txHash && (
              <>
                {" "}
                <code>{t.txHash}</code>
              </>
            )}
            {t.statusCheckError && (
              <p className="tx-history__warning">
                最新の状態を確認できませんでした。表示は古い可能性があります。
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

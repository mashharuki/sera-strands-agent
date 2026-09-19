import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { createApiClient } from "../../services/apiClient.ts";

type Tab = "quote" | "orderbook" | "history";

/**
 * T047: US3のUI。板情報（参考値）・見積もり・取引履歴をそれぞれ別のタブで表示し、
 * 互いに混同しない（FR-005）。
 */
export function MarketPanel() {
  const { getAccessToken } = usePrivy();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("quote");
  const [fromToken, setFromToken] = useState("USDC");
  const [toToken, setToToken] = useState("USDT");
  const [amount, setAmount] = useState("10");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const client = createApiClient(getAccessToken);

  async function fetchQuote() {
    setLoading(true);
    try {
      const { data } = await client.GET("/market/quote", {
        params: { query: { fromToken, toToken, amount } },
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOrderbook() {
    setLoading(true);
    try {
      const pair = `${fromToken}/${toToken}`;
      const { data } = await client.GET("/market/orderbook", {
        params: { query: { pair } },
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  async function fetchHistory() {
    setLoading(true);
    try {
      const { data } = await client.GET("/market/history", {});
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="market-panel">
      <div className="market-panel__tabs">
        <button
          type="button"
          onClick={() => setTab("quote")}
          disabled={tab === "quote"}
        >
          {t("market.quote")}
        </button>
        <button
          type="button"
          onClick={() => setTab("orderbook")}
          disabled={tab === "orderbook"}
        >
          {t("market.orderbook")}
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          disabled={tab === "history"}
        >
          {t("market.history")}
        </button>
      </div>

      {(tab === "quote" || tab === "orderbook") && (
        <div className="market-panel__inputs">
          <input
            value={fromToken}
            onChange={(e) => setFromToken(e.target.value)}
            placeholder="From"
          />
          <input
            value={toToken}
            onChange={(e) => setToToken(e.target.value)}
            placeholder="To"
          />
          {tab === "quote" && (
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
            />
          )}
        </div>
      )}

      <button
        className="market-panel__submit"
        type="button"
        onClick={() =>
          void (tab === "quote"
            ? fetchQuote()
            : tab === "orderbook"
              ? fetchOrderbook()
              : fetchHistory())
        }
        disabled={loading}
      >
        {loading ? t("market.loading") : t("market.get")}
      </button>

      {tab === "orderbook" && result != null && (
        <p className="market-panel__disclaimer">{t("market.disclaimer")}</p>
      )}

      {result != null && (
        <details className="market-panel__result" open>
          <summary>{t("market.result")}</summary>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

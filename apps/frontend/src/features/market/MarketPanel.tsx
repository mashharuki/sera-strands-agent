import { usePrivy } from "@privy-io/react-auth";
import type { components } from "api-spec/generated/types.js";
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { createApiClient } from "../../services/apiClient.ts";
import { CHAIN_STATE_LABEL } from "../transactions/TransactionHistory.tsx";

type Tab = "quote" | "orderbook" | "history";
type Quote = components["schemas"]["Quote"];
type OrderbookView = components["schemas"]["OrderbookView"];
type TradeHistoryItem = components["schemas"]["TradeHistoryItem"];

function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * T047: US3のUI。板情報（参考値）・見積もり・取引履歴をそれぞれ別のタブで表示し、
 * 互いに混同しない（FR-005）。各タブの結果はopenapi生成型に沿って整形して表示する
 * （生のJSONをそのまま出さない）。
 */
export function MarketPanel() {
  const { getAccessToken } = usePrivy();
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>("quote");
  const [fromToken, setFromToken] = useState("USDC");
  const [toToken, setToToken] = useState("USDT");
  const [amount, setAmount] = useState("10");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [orderbook, setOrderbook] = useState<OrderbookView | null>(null);
  const [history, setHistory] = useState<TradeHistoryItem[] | null>(null);

  const client = createApiClient(getAccessToken);

  function selectTab(next: Tab) {
    setTab(next);
    setError(false);
  }

  async function fetchQuote() {
    setLoading(true);
    try {
      const { data, error: err } = await client.GET("/market/quote", {
        params: { query: { fromToken, toToken, amount } },
      });
      setQuote(data ?? null);
      setError(!!err || !data);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOrderbook() {
    setLoading(true);
    try {
      const pair = `${fromToken}/${toToken}`;
      const { data, error: err } = await client.GET("/market/orderbook", {
        params: { query: { pair } },
      });
      setOrderbook(data ?? null);
      setError(!!err || !data);
    } finally {
      setLoading(false);
    }
  }

  async function fetchHistory() {
    setLoading(true);
    try {
      const { data, error: err } = await client.GET("/market/history", {});
      setHistory(data ?? null);
      setError(!!err || !data);
    } finally {
      setLoading(false);
    }
  }

  const hasResult =
    (tab === "quote" && quote) ||
    (tab === "orderbook" && orderbook) ||
    (tab === "history" && history);

  return (
    <div className="market-panel">
      <div className="market-panel__tabs">
        <button
          type="button"
          onClick={() => selectTab("quote")}
          disabled={tab === "quote"}
        >
          {t("market.quote")}
        </button>
        <button
          type="button"
          onClick={() => selectTab("orderbook")}
          disabled={tab === "orderbook"}
        >
          {t("market.orderbook")}
        </button>
        <button
          type="button"
          onClick={() => selectTab("history")}
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

      {tab === "orderbook" && orderbook != null && (
        <p className="market-panel__disclaimer">{t("market.disclaimer")}</p>
      )}

      <div className="market-panel__result">
        {error && <p className="market-panel__error">{t("market.error")}</p>}
        {!error && !hasResult && (
          <p className="market-panel__empty">{t("market.empty")}</p>
        )}
        {!error && tab === "quote" && quote && (
          <dl className="market-panel__quote">
            <dt>{t("market.quote.pair")}</dt>
            <dd>
              {quote.fromToken} → {quote.toToken}
            </dd>
            <dt>{t("market.quote.amount")}</dt>
            <dd>{quote.amount}</dd>
            <dt>{t("market.quote.rate")}</dt>
            <dd>{quote.estimatedRate}</dd>
            {quote.estimatedFee && (
              <>
                <dt>{t("market.quote.fee")}</dt>
                <dd>{quote.estimatedFee}</dd>
              </>
            )}
            {quote.slippage && (
              <>
                <dt>{t("market.quote.slippage")}</dt>
                <dd>{quote.slippage}</dd>
              </>
            )}
            <dt>{t("market.quote.expiresAt")}</dt>
            <dd>{formatDateTime(quote.expiresAt, locale)}</dd>
            <dt>{t("market.quote.id")}</dt>
            <dd>
              <code>{quote.quoteId}</code>
            </dd>
          </dl>
        )}
        {!error && tab === "orderbook" && orderbook && (
          <div className="market-panel__orderbook">
            <OrderbookSide
              title={t("market.orderbook.asks")}
              levels={orderbook.asks}
              variant="ask"
              priceLabel={t("market.orderbook.price")}
              sizeLabel={t("market.orderbook.size")}
              emptyLabel={t("market.orderbook.empty")}
            />
            <OrderbookSide
              title={t("market.orderbook.bids")}
              levels={orderbook.bids}
              variant="bid"
              priceLabel={t("market.orderbook.price")}
              sizeLabel={t("market.orderbook.size")}
              emptyLabel={t("market.orderbook.empty")}
            />
          </div>
        )}
        {!error && tab === "history" && history && (
          <ul className="market-panel__history">
            {history.length === 0 && (
              <li className="market-panel__empty">
                {t("market.history.empty")}
              </li>
            )}
            {history.map((item) => (
              <li
                key={item.transactionId}
                className="market-panel__history-item"
              >
                <strong>
                  {item.type === "swap" ? "swap" : t("transactions.transfer")}
                </strong>
                <span>{item.summary}</span>
                {item.chainState && (
                  <span
                    className={`market-panel__history-state market-panel__history-state--${item.chainState}`}
                  >
                    {CHAIN_STATE_LABEL[item.chainState]
                      ? t(CHAIN_STATE_LABEL[item.chainState])
                      : item.chainState}
                  </span>
                )}
                {item.occurredAt && (
                  <time>{formatDateTime(item.occurredAt, locale)}</time>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function OrderbookSide({
  title,
  levels,
  variant,
  priceLabel,
  sizeLabel,
  emptyLabel,
}: {
  title: string;
  levels: components["schemas"]["OrderbookLevel"][];
  variant: "bid" | "ask";
  priceLabel: string;
  sizeLabel: string;
  emptyLabel: string;
}) {
  return (
    <div
      className={`market-panel__orderbook-side market-panel__orderbook-side--${variant}`}
    >
      <h4>{title}</h4>
      {levels.length === 0 ? (
        <p className="market-panel__empty">{emptyLabel}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{priceLabel}</th>
              <th>{sizeLabel}</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 板情報の各行は安定したIDを持たない
              <tr key={i}>
                <td>{level.price}</td>
                <td>{level.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

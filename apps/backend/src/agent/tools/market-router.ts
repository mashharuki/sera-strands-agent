export type MarketIntent = "orderbook" | "quote" | "history" | "unknown";

/**
 * T046: ユーザー発話を板/見積もり/履歴の3種に分類する（FR-005: 混同禁止）。
 *
 * 本番の意図判定はStrands Agentのツール呼び出し（各ツールのdescriptionに
 * よるLLMの判断）が主体であり、この関数はテスト容易な形での分類ロジックの
 * 明文化と、ログ・簡易バリデーション用の軽量なヒューリスティックを提供する。
 */
export function classifyMarketIntent(message: string): MarketIntent {
  const text = message.toLowerCase();

  const historyKeywords = ["履歴", "過去の取引", "取引履歴", "history"];
  if (historyKeywords.some((k) => text.includes(k))) return "history";

  const orderbookKeywords = ["板", "オーダーブック", "orderbook", "order book"];
  if (orderbookKeywords.some((k) => text.includes(k))) return "orderbook";

  const quoteKeywords = [
    "見積もり",
    "レート",
    "価格",
    "quote",
    "交換レート",
    "いくら",
  ];
  if (quoteKeywords.some((k) => text.includes(k))) return "quote";

  return "unknown";
}

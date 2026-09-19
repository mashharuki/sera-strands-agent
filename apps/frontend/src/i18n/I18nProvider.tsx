import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "sera-locale";

const ja = {
  "language.switch": "表示言語",
  "app.loading": "ワークスペースを準備しています...",
  "login.eyebrow": "SERA PROTOCOL",
  "login.title": "資産管理を、会話の速さで。",
  "login.description":
    "ウォレットの確認からスワップ、送金まで。安全な確認フローを備えたAIアシスタントです。",
  "login.button": "ウォレットにログイン",
  "app.toolsAria": "取引ツール",
  "app.connected": "Sepolia に接続中",
  "app.market": "マーケット",
  "app.chatEyebrow": "SERA アシスタント",
  "app.newConversation": "新しい会話",
  "app.walletAria": "ウォレット情報",
  "app.wallet": "マイウォレット",
  "app.safety": "署名が必要な操作は、内容を確認してから実行できます。",
  "chat.eyebrow": "あなたの金融アシスタント",
  "chat.title": "今日は何をしますか？",
  "chat.description":
    "残高の確認やマーケット情報の取得、送金まで自然な言葉で依頼できます。",
  "chat.promptBalance": "残高を教えて",
  "chat.promptQuote": "USDCからUSDTの見積もり",
  "chat.promptHistory": "最近の取引を確認",
  "chat.you": "あなた",
  "chat.thinking": "考えています…",
  "chat.placeholder": "ウォレットを作成して、など",
  "chat.send": "送信",
  "chat.hint": "Enter で送信 ・ Shift + Enter で改行",
  "chat.requestFailed": "チャットの呼び出しに失敗しました",
  "chat.unknownError": "不明なエラー",
  "chat.connectionFailed": "通信に失敗しました",
  "chat.error": "エラー",
  "market.quote": "見積もり",
  "market.orderbook": "板情報（参考値）",
  "market.history": "取引履歴",
  "market.loading": "取得中...",
  "market.get": "取得",
  "market.disclaimer":
    "※ 参考値（実際の板データではなく、見積もりから合成した近似値）",
  "market.result": "取得結果",
  "transactions.title": "最近の取引",
  "transactions.loading": "取引を確認中...",
  "transactions.error": "取引履歴を取得できませんでした",
  "transactions.empty": "実行済みの取引はまだありません",
  "transactions.transfer": "送金",
  "transactions.success": "確定（成功）",
  "transactions.failed": "確定（失敗）",
  "transactions.pending": "送信済み・結果確定待ち",
  "transactions.unknown": "状態不明",
  "transactions.stale":
    "最新の状態を確認できませんでした。表示は古い可能性があります。",
  "wallet.loading": "ウォレット状況を確認中...",
  "wallet.connected": "接続済みウォレット",
  "wallet.notCreated": "ウォレットが未作成です",
  "wallet.creating": "作成中...",
  "wallet.create": "ウォレットを作成",
  "wallet.registerError": "ウォレット情報の登録に失敗しました",
  "balance.loading": "残高を確認中...",
  "balance.error": "残高を取得できませんでした",
  "balance.title": "残高",
  "balance.assets": "{count} 件の資産",
  "balance.empty": "保有トークンはありません",
  "approval.loading": "確認内容を読み込み中...",
  "approval.error": "確認内容を取得できませんでした",
  "confirm.swapDone": "swapを実行しました。トランザクションID:",
  "confirm.transferDone": "送金を実行しました。トランザクションID:",
  "confirm.swapTitle": "swapの確認",
  "confirm.transferTitle": "送金の確認",
  "confirm.network": "ネットワーク",
  "confirm.token": "トークン",
  "confirm.amount": "数量",
  "confirm.estimatedFee": "手数料（概算）",
  "confirm.unknown": "不明",
  "confirm.slippage": "スリッページ",
  "confirm.destination": "送信先",
  "confirm.defaultFee": "ネットワーク手数料（Sepolia ETH）",
  "confirm.signing": "ウォレットで署名中...",
  "confirm.executing": "実行中...",
  "confirm.executeSwap": "ウォレットで署名して実行",
  "confirm.executeTransfer": "ウォレットで署名して送金",
  "confirm.swapError": "swapの実行に失敗しました",
  "confirm.transferError": "送金の実行に失敗しました",
} as const;

const en: Record<keyof typeof ja, string> = {
  "language.switch": "Display language",
  "app.loading": "Preparing your workspace...",
  "login.eyebrow": "SERA PROTOCOL",
  "login.title": "Manage your assets through conversation.",
  "login.description":
    "An AI assistant with a secure confirmation flow for wallet checks, swaps, and transfers.",
  "login.button": "Log in to your wallet",
  "app.toolsAria": "Trading tools",
  "app.connected": "Connected to Sepolia",
  "app.market": "Market",
  "app.chatEyebrow": "SERA ASSISTANT",
  "app.newConversation": "New conversation",
  "app.walletAria": "Wallet information",
  "app.wallet": "My wallet",
  "app.safety":
    "Actions requiring a signature are executed only after you review the details.",
  "chat.eyebrow": "YOUR FINANCIAL COPILOT",
  "chat.title": "What would you like to do?",
  "chat.description":
    "Ask naturally about balances, market data, transfers, and more.",
  "chat.promptBalance": "Show my balance",
  "chat.promptQuote": "Quote USDC to USDT",
  "chat.promptHistory": "Show recent transactions",
  "chat.you": "You",
  "chat.thinking": "Thinking…",
  "chat.placeholder": "Create a wallet, for example",
  "chat.send": "Send",
  "chat.hint": "Enter to send · Shift + Enter for a new line",
  "chat.requestFailed": "Chat request failed",
  "chat.unknownError": "Unknown error",
  "chat.connectionFailed": "Connection failed",
  "chat.error": "Error",
  "market.quote": "Quote",
  "market.orderbook": "Orderbook (estimate)",
  "market.history": "History",
  "market.loading": "Loading...",
  "market.get": "Get data",
  "market.disclaimer":
    "* Estimated values synthesized from quotes, not live orderbook data.",
  "market.result": "Result",
  "transactions.title": "Recent transactions",
  "transactions.loading": "Loading transactions...",
  "transactions.error": "Could not load transaction history",
  "transactions.empty": "No completed transactions yet",
  "transactions.transfer": "Transfer",
  "transactions.success": "Confirmed (success)",
  "transactions.failed": "Confirmed (failed)",
  "transactions.pending": "Broadcast · awaiting confirmation",
  "transactions.unknown": "Unknown status",
  "transactions.stale":
    "The latest status could not be checked. This information may be outdated.",
  "wallet.loading": "Checking wallet status...",
  "wallet.connected": "Connected wallet",
  "wallet.notCreated": "No wallet has been created",
  "wallet.creating": "Creating...",
  "wallet.create": "Create wallet",
  "wallet.registerError": "Could not register wallet information",
  "balance.loading": "Checking balances...",
  "balance.error": "Could not load balances",
  "balance.title": "Balances",
  "balance.assets": "{count} assets",
  "balance.empty": "No tokens held",
  "approval.loading": "Loading confirmation details...",
  "approval.error": "Could not load confirmation details",
  "confirm.swapDone": "Swap submitted. Transaction ID:",
  "confirm.transferDone": "Transfer submitted. Transaction ID:",
  "confirm.swapTitle": "Confirm swap",
  "confirm.transferTitle": "Confirm transfer",
  "confirm.network": "Network",
  "confirm.token": "Token",
  "confirm.amount": "Amount",
  "confirm.estimatedFee": "Estimated fee",
  "confirm.unknown": "Unknown",
  "confirm.slippage": "Slippage",
  "confirm.destination": "Destination",
  "confirm.defaultFee": "Network fee (Sepolia ETH)",
  "confirm.signing": "Waiting for wallet signature...",
  "confirm.executing": "Executing...",
  "confirm.executeSwap": "Sign and execute swap",
  "confirm.executeTransfer": "Sign and send transfer",
  "confirm.swapError": "Could not execute the swap",
  "confirm.transferError": "Could not execute the transfer",
};

export type Locale = "ja" | "en";
export type TranslationKey = keyof typeof ja;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "ja" || stored === "en") return stored;
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "ja";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) => {
      const dictionary = locale === "ja" ? ja : en;
      return Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        dictionary[key],
      );
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <fieldset className="language-switch">
      <legend className="visually-hidden">{t("language.switch")}</legend>
      <button
        type="button"
        aria-pressed={locale === "ja"}
        onClick={() => setLocale("ja")}
      >
        日本語
      </button>
      <button
        type="button"
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
    </fieldset>
  );
}

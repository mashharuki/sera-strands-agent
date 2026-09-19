import { usePrivy } from "@privy-io/react-auth";
import { ChatShell } from "./features/chat/ChatShell.tsx";
import { MarketPanel } from "./features/market/MarketPanel.tsx";
import { TransactionHistory } from "./features/transactions/TransactionHistory.tsx";
import { BalanceView } from "./features/wallet/BalanceView.tsx";
import { WalletCreationFlow } from "./features/wallet/WalletCreationFlow.tsx";
import { LanguageSwitch, useI18n } from "./i18n/I18nProvider.tsx";
import "./App.css";

/** FR-019: 未ログインの利用者には先にログインを促し、チャット機能へのアクセスを許可しない。 */
function App() {
  const { ready, authenticated, login } = usePrivy();
  const { t } = useI18n();

  if (!ready) {
    return (
      <section className="auth-screen" aria-live="polite">
        <div className="auth-screen__mark">S</div>
        <p>{t("app.loading")}</p>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="auth-screen">
        <div className="auth-screen__mark">S</div>
        <LanguageSwitch />
        <p className="eyebrow">{t("login.eyebrow")}</p>
        <h1>{t("login.title")}</h1>
        <p className="auth-screen__lead">{t("login.description")}</p>
        <button type="button" onClick={() => login()}>
          {t("login.button")}
        </button>
      </section>
    );
  }

  return (
    <div className="app-shell">
      <aside className="utility-rail" aria-label={t("app.toolsAria")}>
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            S
          </span>
          <div>
            <strong>Sera</strong>
            <span>Protocol Assistant</span>
          </div>
        </div>
        <div className="utility-rail__intro">
          <span className="status-dot" aria-hidden="true" />
          {t("app.connected")}
        </div>
        <section className="rail-section">
          <div className="section-heading">
            <span>MARKET</span>
            <h2>{t("app.market")}</h2>
          </div>
          <MarketPanel />
        </section>
        <section className="rail-section rail-section--history">
          <TransactionHistory />
        </section>
      </aside>

      <main className="chat-workspace">
        <header className="chat-header">
          <div>
            <p className="eyebrow">{t("app.chatEyebrow")}</p>
            <h1>{t("app.newConversation")}</h1>
          </div>
          <div className="chat-header__actions">
            <LanguageSwitch />
            <div className="chat-header__network">
              <span className="status-dot" aria-hidden="true" />
              Sepolia
            </div>
          </div>
        </header>
        <ChatShell />
      </main>

      <aside className="wallet-rail" aria-label={t("app.walletAria")}>
        <div className="section-heading">
          <span>PORTFOLIO</span>
          <h2>{t("app.wallet")}</h2>
        </div>
        <WalletCreationFlow />
        <BalanceView />
        <div className="wallet-rail__note">
          <span aria-hidden="true">✓</span>
          <p>{t("app.safety")}</p>
        </div>
      </aside>
    </div>
  );
}

export default App;

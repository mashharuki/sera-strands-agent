import { usePrivy } from "@privy-io/react-auth";
import { ChatShell } from "./features/chat/ChatShell.tsx";
import { BalanceView } from "./features/wallet/BalanceView.tsx";
import { WalletCreationFlow } from "./features/wallet/WalletCreationFlow.tsx";
import "./App.css";

/** FR-019: 未ログインの利用者には先にログインを促し、チャット機能へのアクセスを許可しない。 */
function App() {
  const { ready, authenticated, login } = usePrivy();

  if (!ready) {
    return (
      <section id="center">
        <p>読み込み中...</p>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section id="center">
        <h1>Sera Protocol AIチャットボット</h1>
        <p>チャットを利用するにはログインが必要です。</p>
        <button type="button" onClick={() => login()}>
          ログイン
        </button>
      </section>
    );
  }

  return (
    <>
      <WalletCreationFlow />
      <BalanceView />
      <ChatShell />
    </>
  );
}

export default App;

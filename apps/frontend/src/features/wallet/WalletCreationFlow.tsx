import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { createApiClient } from "../../services/apiClient.ts";
import { useSessionStore } from "../../store/session.ts";
import { useCreateSeraWallet } from "./createWallet.ts";

/**
 * T034: US1のUI。ウォレット未作成なら作成を促し、作成完了後はアドレスを表示する。
 * spec.md US1 AC1〜AC3に対応。
 */
export function WalletCreationFlow() {
  const { getAccessToken } = usePrivy();
  const setWallet = useSessionStore((s) => s.setWallet);
  const wallet = useSessionStore((s) => s.wallet);
  const { state, createSeraWallet } = useCreateSeraWallet();

  const walletQuery = useQuery({
    queryKey: ["wallet"],
    queryFn: async () => {
      const client = createApiClient(getAccessToken);
      const { data, response } = await client.GET("/wallet", {});
      if (response.status === 404) return null;
      return data ?? null;
    },
  });

  useEffect(() => {
    if (walletQuery.data) setWallet(walletQuery.data);
  }, [walletQuery.data, setWallet]);

  useEffect(() => {
    if (state.status === "done") setWallet(state.wallet);
  }, [state, setWallet]);

  const effectiveWallet = wallet ?? walletQuery.data;

  if (walletQuery.isLoading) {
    return <div className="wallet-banner">ウォレット状況を確認中...</div>;
  }

  if (effectiveWallet) {
    return (
      <div className="wallet-banner">
        ウォレット: <code>{effectiveWallet.address}</code>
      </div>
    );
  }

  return (
    <div className="wallet-banner">
      <span>ウォレットが未作成です。</span>
      <button
        type="button"
        onClick={() => void createSeraWallet()}
        disabled={state.status === "creating"}
      >
        {state.status === "creating" ? "作成中..." : "ウォレットを作成"}
      </button>
      {state.status === "error" && (
        <span className="wallet-error">{state.message}</span>
      )}
    </div>
  );
}

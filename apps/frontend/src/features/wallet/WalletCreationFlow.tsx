import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { createApiClient } from "../../services/apiClient.ts";
import { useSessionStore } from "../../store/session.ts";
import { useCreateSeraWallet } from "./createWallet.ts";

/**
 * T034: US1のUI。ウォレット未作成なら作成を促し、作成完了後はアドレスを表示する。
 * spec.md US1 AC1〜AC3に対応。
 */
export function WalletCreationFlow() {
  const { getAccessToken } = usePrivy();
  const { t } = useI18n();
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
    return (
      <div className="wallet-banner wallet-banner--loading">
        {t("wallet.loading")}
      </div>
    );
  }

  if (effectiveWallet) {
    return (
      <div className="wallet-banner">
        <div className="wallet-banner__topline">
          <span className="wallet-banner__icon" aria-hidden="true">
            ◈
          </span>
          <span>{t("wallet.connected")}</span>
          <span className="status-dot" aria-hidden="true" />
        </div>
        <code title={effectiveWallet.address}>{effectiveWallet.address}</code>
        <span className="wallet-banner__network">Ethereum Sepolia</span>
      </div>
    );
  }

  return (
    <div className="wallet-banner">
      <span className="wallet-banner__icon" aria-hidden="true">
        ◈
      </span>
      <strong>{t("wallet.notCreated")}</strong>
      <button
        type="button"
        onClick={() => void createSeraWallet()}
        disabled={state.status === "creating"}
      >
        {state.status === "creating"
          ? t("wallet.creating")
          : t("wallet.create")}
      </button>
      {state.status === "error" && (
        <span className="wallet-error">{state.message}</span>
      )}
    </div>
  );
}

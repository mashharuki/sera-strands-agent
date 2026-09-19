import { useCreateWallet, usePrivy } from "@privy-io/react-auth";
import { useCallback, useState } from "react";
import type { Wallet } from "shared";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { createApiClient } from "../../services/apiClient.ts";

const SEPOLIA_CHAIN_ID = 11155111;

export type WalletCreationState =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "done"; wallet: Wallet }
  | { status: "error"; message: string };

/**
 * T032: Privy embedded walletの作成（クライアント側）から
 * `POST /wallet`（`apps/backend/src/routes/wallet.ts`）への登録までを一連で行う。
 * FR-001, FR-002（既存ウォレットがあれば作成せず既存情報を返す）。
 */
export function useCreateSeraWallet() {
  const { getAccessToken, user } = usePrivy();
  const { t } = useI18n();
  const { createWallet } = useCreateWallet();
  const [state, setState] = useState<WalletCreationState>({ status: "idle" });

  const run = useCallback(async () => {
    setState({ status: "creating" });
    try {
      // Privy側に埋め込みウォレットが既にある場合（バックエンドへの登録だけ未完了など）は
      // 作成せず既存のものを登録する。作成すると "User already has an embedded wallet" になる。
      const existing = user?.linkedAccounts.find(
        (a) => a.type === "wallet" && a.walletClientType === "privy",
      );
      const privyWallet =
        existing && "address" in existing ? existing : await createWallet();
      const client = createApiClient(getAccessToken);
      const { data, error } = await client.POST("/wallet", {
        params: {
          query: { address: privyWallet.address, chainId: SEPOLIA_CHAIN_ID },
        },
      });
      if (error || !data) {
        throw new Error(t("wallet.registerError"));
      }
      setState({ status: "done", wallet: data });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ status: "error", message });
      throw err;
    }
  }, [createWallet, getAccessToken, user, t]);

  return { state, createSeraWallet: run };
}

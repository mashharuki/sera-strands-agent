import { useCreateWallet, usePrivy } from "@privy-io/react-auth";
import { useCallback, useState } from "react";
import type { Wallet } from "shared";
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
  const { getAccessToken } = usePrivy();
  const { createWallet } = useCreateWallet();
  const [state, setState] = useState<WalletCreationState>({ status: "idle" });

  const run = useCallback(async () => {
    setState({ status: "creating" });
    try {
      const privyWallet = await createWallet();
      const client = createApiClient(getAccessToken);
      const { data, error } = await client.POST("/wallet", {
        params: {
          query: { address: privyWallet.address, chainId: SEPOLIA_CHAIN_ID },
        },
      });
      if (error || !data) {
        throw new Error("ウォレット情報の登録に失敗しました");
      }
      setState({ status: "done", wallet: data });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ status: "error", message });
      throw err;
    }
  }, [createWallet, getAccessToken]);

  return { state, createSeraWallet: run };
}

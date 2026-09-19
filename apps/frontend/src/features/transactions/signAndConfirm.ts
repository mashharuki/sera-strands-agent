import {
  usePrivy,
  useSignTransaction,
  useSignTypedData,
} from "@privy-io/react-auth";
import { useCallback, useState } from "react";
import type { ApprovalRequest, Transaction } from "shared";
import { createApiClient } from "../../services/apiClient.ts";

export type ConfirmState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "confirming" }
  | { status: "done"; transaction: Transaction }
  | { status: "error"; message: string };

/**
 * T056: 確認済み内容（ApprovalRequest.approvedContentSnapshot）とユーザーの
 * チャット承認を前提に、Privyでウォレット署名を取得してから
 * `POST /transactions/swap/confirm` を呼び出す一連のフロー（FR-009）。
 *
 * `approval.signPayload`（sera-mcpのEIP-712 route_params）をそのまま
 * `useSignTypedData` へ渡す。正確なフィールド構造はsera-mcpとの実疎通確認が
 * 必要（research.md §1.3, スパイクS5未実施）。
 */
export function useSignAndConfirmSwap() {
  const { getAccessToken } = usePrivy();
  const { signTypedData } = useSignTypedData();
  const [state, setState] = useState<ConfirmState>({ status: "idle" });

  const run = useCallback(
    async (approval: ApprovalRequest) => {
      setState({ status: "signing" });
      try {
        const { signature } = await signTypedData(
          approval.signPayload as Parameters<typeof signTypedData>[0],
        );

        setState({ status: "confirming" });
        const client = createApiClient(getAccessToken);
        const { data, error } = await client.POST(
          "/transactions/swap/confirm",
          {
            body: { approvalId: approval.approvalId, signature },
          },
        );
        if (error || !data) {
          throw new Error("swapの実行に失敗しました");
        }
        setState({ status: "done", transaction: data });
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", message });
        throw err;
      }
    },
    [signTypedData, getAccessToken],
  );

  return { state, signAndConfirmSwap: run };
}

/**
 * T063/T065: 送金用。`approval.signPayload`（`sera.build_transfer`が返した未署名tx）を
 * Privyのウォレットで署名し、得られた**署名済みraw tx**を`signature`として
 * `POST /transactions/transfer/confirm`へ渡す（サーバー側で宛先・数量・署名者を検証する、FR-010）。
 */
export function useSignAndConfirmTransfer() {
  const { getAccessToken } = usePrivy();
  const { signTransaction } = useSignTransaction();
  const [state, setState] = useState<ConfirmState>({ status: "idle" });

  const run = useCallback(
    async (approval: ApprovalRequest) => {
      setState({ status: "signing" });
      try {
        const unsigned = {
          ...(approval.signPayload as Record<string, unknown>),
        };
        // Privyは`gasLimit`、Sera側は`gas`の可能性があるため寄せる（実疎通で要確認）。
        if (unsigned.gas !== undefined && unsigned.gasLimit === undefined) {
          unsigned.gasLimit = unsigned.gas;
          unsigned.gas = undefined;
        }
        const { signature } = await signTransaction(
          unsigned as Parameters<typeof signTransaction>[0],
        );

        setState({ status: "confirming" });
        const client = createApiClient(getAccessToken);
        const { data, error } = await client.POST(
          "/transactions/transfer/confirm",
          { body: { approvalId: approval.approvalId, signature } },
        );
        if (error || !data) {
          const message =
            (error as { message?: string } | undefined)?.message ??
            "送金の実行に失敗しました";
          throw new Error(message);
        }
        setState({ status: "done", transaction: data });
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", message });
        throw err;
      }
    },
    [signTransaction, getAccessToken],
  );

  return { state, signAndConfirmTransfer: run };
}

import {
  usePrivy,
  useSignTransaction,
  useSignTypedData,
} from "@privy-io/react-auth";
import { useCallback, useState } from "react";
import type { ApprovalRequest, Transaction } from "shared";
import { useI18n } from "../../i18n/I18nProvider.tsx";
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
  const { t } = useI18n();
  const { signTypedData } = useSignTypedData();
  const [state, setState] = useState<ConfirmState>({ status: "idle" });

  const run = useCallback(
    async (approval: ApprovalRequest) => {
      setState({ status: "signing" });
      try {
        const { signature } = await signTypedData(
          approval.signPayload as Parameters<typeof signTypedData>[0],
        );

        // 入力トークンがEIP-2612 permitを要求する場合は、そのpermitにも署名する。
        // 署名対象はサーバーが承認時に保存したもので、サーバー側で署名者を検証してからSeraへ送る。
        const permitSignature = approval.permitPayload
          ? (
              await signTypedData(
                approval.permitPayload as Parameters<typeof signTypedData>[0],
              )
            ).signature
          : undefined;

        setState({ status: "confirming" });
        const client = createApiClient(getAccessToken);
        const { data, error } = await client.POST(
          "/transactions/swap/confirm",
          {
            body: {
              approvalId: approval.approvalId,
              signature,
              ...(permitSignature && { permitSignature }),
            },
          },
        );
        if (error || !data) {
          throw new Error(t("confirm.swapError"));
        }
        setState({ status: "done", transaction: data });
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", message });
        throw err;
      }
    },
    [signTypedData, getAccessToken, t],
  );

  return { state, signAndConfirmSwap: run };
}

/**
 * T063/T065: 送金用。`approval.signPayload`（バックエンドがviemで組み立てた未署名のERC-20 transfer tx。`gasLimit`等はPrivyの形式）を
 * Privyのウォレットで署名し、得られた**署名済みraw tx**を`signature`として
 * `POST /transactions/transfer/confirm`へ渡す（サーバー側で宛先・数量・署名者を検証する、FR-010）。
 */
export function useSignAndConfirmTransfer() {
  const { getAccessToken } = usePrivy();
  const { t } = useI18n();
  const { signTransaction } = useSignTransaction();
  const [state, setState] = useState<ConfirmState>({ status: "idle" });

  const run = useCallback(
    async (approval: ApprovalRequest) => {
      setState({ status: "signing" });
      try {
        const unsigned = {
          ...(approval.signPayload as Record<string, unknown>),
        };
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
            t("confirm.transferError");
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
    [signTransaction, getAccessToken, t],
  );

  return { state, signAndConfirmTransfer: run };
}

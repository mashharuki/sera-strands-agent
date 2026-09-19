import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { createApiClient } from "../../services/apiClient.ts";
import { useSignAndConfirmSwap } from "./signAndConfirm.ts";

/**
 * T055: US4のUI。ApprovalRequest.approvedContentSnapshot
 * （ネットワーク・トークン・数量・手数料・スリッページ）を表示し、
 * チャット承認済みのユーザーにウォレット署名を求める（FR-008, FR-009）。
 */
export function SwapConfirm({
  approvalId,
  onDone,
}: {
  approvalId: string;
  onDone?: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const { t } = useI18n();
  const { state, signAndConfirmSwap } = useSignAndConfirmSwap();

  const approvalQuery = useQuery({
    queryKey: ["approval", approvalId],
    queryFn: async () => {
      const client = createApiClient(getAccessToken);
      const { data, error } = await client.GET(
        "/transactions/approvals/{approvalId}",
        {
          params: { path: { approvalId } },
        },
      );
      if (error || !data) throw new Error(t("approval.error"));
      return data;
    },
  });

  if (approvalQuery.isLoading)
    return <div className="swap-confirm">{t("approval.loading")}</div>;
  if (approvalQuery.isError || !approvalQuery.data) {
    return (
      <div className="swap-confirm swap-confirm--error">
        {t("approval.error")}
      </div>
    );
  }

  const approval = approvalQuery.data;
  const snapshot = approval.approvedContentSnapshot as {
    network?: string;
    token?: string;
    toToken?: string;
    amount?: string;
    estimatedFee?: string;
    slippage?: string;
  };

  if (state.status === "done") {
    return (
      <div className="swap-confirm swap-confirm--done">
        {t("confirm.swapDone")} <code>{state.transaction.transactionId}</code>
      </div>
    );
  }

  return (
    <div className="swap-confirm">
      <h3>{t("confirm.swapTitle")}</h3>
      <dl>
        <dt>{t("confirm.network")}</dt>
        <dd>{snapshot.network}</dd>
        <dt>{t("confirm.token")}</dt>
        <dd>
          {snapshot.token} → {snapshot.toToken}
        </dd>
        <dt>{t("confirm.amount")}</dt>
        <dd>{snapshot.amount}</dd>
        <dt>{t("confirm.estimatedFee")}</dt>
        <dd>{snapshot.estimatedFee ?? t("confirm.unknown")}</dd>
        {snapshot.slippage && (
          <>
            <dt>{t("confirm.slippage")}</dt>
            <dd>{snapshot.slippage}</dd>
          </>
        )}
      </dl>
      <button
        type="button"
        disabled={state.status === "signing" || state.status === "confirming"}
        onClick={() => void signAndConfirmSwap(approval).then(() => onDone?.())}
      >
        {state.status === "signing"
          ? t("confirm.signing")
          : state.status === "confirming"
            ? t("confirm.executing")
            : t("confirm.executeSwap")}
      </button>
      {state.status === "error" && (
        <p className="swap-confirm__error">{state.message}</p>
      )}
    </div>
  );
}

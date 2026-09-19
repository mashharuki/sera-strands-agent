import type { ApprovalRequest } from "shared";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useSignAndConfirmTransfer } from "./signAndConfirm.ts";

/**
 * T063: US5のUI。ApprovalRequest.approvedContentSnapshot
 * （ネットワーク・トークン・数量・送信先）を表示し、チャット承認済みのユーザーに
 * ウォレット署名を求める（FR-008, FR-009）。送信先は誤送金防止のため全文表示する。
 */
export function TransferConfirm({
  approval,
  onDone,
}: {
  approval: ApprovalRequest;
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const { state, signAndConfirmTransfer } = useSignAndConfirmTransfer();
  const snapshot = approval.approvedContentSnapshot as {
    network?: string;
    token?: string;
    amount?: string;
    destinationAddress?: string;
    estimatedFee?: string;
  };

  if (state.status === "done") {
    return (
      <div className="transfer-confirm transfer-confirm--done">
        {t("confirm.transferDone")}{" "}
        <code>{state.transaction.transactionId}</code>
      </div>
    );
  }

  return (
    <div className="transfer-confirm">
      <h3>{t("confirm.transferTitle")}</h3>
      <dl>
        <dt>{t("confirm.network")}</dt>
        <dd>{snapshot.network}</dd>
        <dt>{t("confirm.token")}</dt>
        <dd>{snapshot.token}</dd>
        <dt>{t("confirm.amount")}</dt>
        <dd>{snapshot.amount}</dd>
        <dt>{t("confirm.destination")}</dt>
        <dd>
          <code>{snapshot.destinationAddress}</code>
        </dd>
        <dt>{t("confirm.estimatedFee")}</dt>
        <dd>{snapshot.estimatedFee ?? t("confirm.defaultFee")}</dd>
      </dl>
      <button
        type="button"
        disabled={state.status === "signing" || state.status === "confirming"}
        onClick={() =>
          void signAndConfirmTransfer(approval)
            .then(() => onDone?.())
            .catch(() => undefined)
        }
      >
        {state.status === "signing"
          ? t("confirm.signing")
          : state.status === "confirming"
            ? t("confirm.executing")
            : t("confirm.executeTransfer")}
      </button>
      {state.status === "error" && (
        <p className="transfer-confirm__error">{state.message}</p>
      )}
    </div>
  );
}

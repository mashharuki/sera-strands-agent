import type { ApprovalRequest } from "shared";
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
        送金を実行しました。トランザクションID:{" "}
        <code>{state.transaction.transactionId}</code>
      </div>
    );
  }

  return (
    <div className="transfer-confirm">
      <h3>送金の確認</h3>
      <dl>
        <dt>ネットワーク</dt>
        <dd>{snapshot.network}</dd>
        <dt>トークン</dt>
        <dd>{snapshot.token}</dd>
        <dt>数量</dt>
        <dd>{snapshot.amount}</dd>
        <dt>送信先</dt>
        <dd>
          <code>{snapshot.destinationAddress}</code>
        </dd>
        <dt>手数料（概算）</dt>
        <dd>{snapshot.estimatedFee ?? "ネットワーク手数料（Sepolia ETH）"}</dd>
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
          ? "ウォレットで署名中..."
          : state.status === "confirming"
            ? "実行中..."
            : "ウォレットで署名して送金"}
      </button>
      {state.status === "error" && (
        <p className="transfer-confirm__error">{state.message}</p>
      )}
    </div>
  );
}

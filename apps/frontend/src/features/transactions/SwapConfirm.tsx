import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
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
      if (error || !data) throw new Error("確認内容の取得に失敗しました");
      return data;
    },
  });

  if (approvalQuery.isLoading)
    return <div className="swap-confirm">確認内容を読み込み中...</div>;
  if (approvalQuery.isError || !approvalQuery.data) {
    return (
      <div className="swap-confirm swap-confirm--error">
        確認内容を取得できませんでした
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
        swapを実行しました。トランザクションID:{" "}
        <code>{state.transaction.transactionId}</code>
      </div>
    );
  }

  return (
    <div className="swap-confirm">
      <h3>swapの確認</h3>
      <dl>
        <dt>ネットワーク</dt>
        <dd>{snapshot.network}</dd>
        <dt>トークン</dt>
        <dd>
          {snapshot.token} → {snapshot.toToken}
        </dd>
        <dt>数量</dt>
        <dd>{snapshot.amount}</dd>
        <dt>手数料（概算）</dt>
        <dd>{snapshot.estimatedFee ?? "不明"}</dd>
        {snapshot.slippage && (
          <>
            <dt>スリッページ</dt>
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
          ? "ウォレットで署名中..."
          : state.status === "confirming"
            ? "実行中..."
            : "ウォレットで署名して実行"}
      </button>
      {state.status === "error" && (
        <p className="swap-confirm__error">{state.message}</p>
      )}
    </div>
  );
}

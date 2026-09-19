import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "../../services/apiClient.ts";
import { SwapConfirm } from "./SwapConfirm.tsx";
import { TransferConfirm } from "./TransferConfirm.tsx";

/** チャットの`approval_required`で通知された承認を取得し、種別に応じた確認画面を出し分ける。 */
export function ApprovalConfirm({
  approvalId,
  onDone,
}: {
  approvalId: string;
  onDone?: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const approvalQuery = useQuery({
    queryKey: ["approval", approvalId],
    queryFn: async () => {
      const client = createApiClient(getAccessToken);
      const { data, error } = await client.GET(
        "/transactions/approvals/{approvalId}",
        { params: { path: { approvalId } } },
      );
      if (error || !data) throw new Error("確認内容の取得に失敗しました");
      return data;
    },
  });

  if (approvalQuery.isLoading) return <div>確認内容を読み込み中...</div>;
  if (approvalQuery.isError || !approvalQuery.data) {
    return <div>確認内容を取得できませんでした</div>;
  }

  return approvalQuery.data.type === "transfer" ? (
    <TransferConfirm approval={approvalQuery.data} onDone={onDone} />
  ) : (
    <SwapConfirm approvalId={approvalId} onDone={onDone} />
  );
}

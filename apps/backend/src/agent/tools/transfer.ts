import { tool } from "@strands-agents/sdk";
import { isAddress, parseUnits } from "viem";
import { z } from "zod";
import { createApprovalRequest } from "../../store/approvals.js";
import { getWallet } from "../../store/wallets.js";
import {
  checkSufficientBalance,
  FAUCET_GUIDANCE,
  tokenShortageMessage,
} from "../balance-check.js";
import { callSeraToolSafely, toUserFacingMessage } from "../errors.js";
import { buildUnsignedTransfer } from "../onchain-transfer.js";
import { resolveToken } from "../sera-tools.js";

const TRANSFER_APPROVAL_TTL_SECONDS = 300;

const inputSchema = z.object({
  token: z.string().describe("送金するトークンのシンボル（例: USDC）"),
  amount: z.string().describe("送金数量（人間が読む単位）"),
  destinationAddress: z
    .string()
    .describe("送金先の0x始まりのアドレス。ユーザーが明示した値のみを使うこと"),
});

/**
 * T064: チャットでの送金意図検出。FR-006: token/amount/destinationAddressが揃うまで
 * LLMはこのツールを呼ばず、不足時はユーザーへ質問する（システムプロンプトで指示済み）。
 *
 * このツール自体は送金しない。未署名トランザクションを生成してApprovalRequestを作り、
 * `approval_required`としてフロントエンドへ伝えるまでを担う（FR-008, FR-009）。
 * 実行は `POST /transactions/transfer/confirm`（チャット承認＋ウォレット署名後）。
 */
export function createTransferIntentTool(
  userId: string,
  onApprovalCreated: (approvalId: string) => void,
) {
  return tool({
    name: "request_transfer",
    description:
      "トークンの送金を依頼する。実行はせず、ユーザーへの確認内容（ネットワーク・トークン・数量・送信先・手数料）を提示する準備をするだけ。実際の実行にはユーザーのチャット承認とウォレット署名が別途必要。宛先アドレスはユーザーが明示したものだけを使い、推測や補完をしてはならない。",
    inputSchema,
    callback: async (input) => {
      if (!isAddress(input.destinationAddress)) {
        return {
          error:
            "送金先アドレスの形式が不正です。ユーザーに正しいアドレスを確認してください",
        };
      }
      if (!(Number(input.amount) > 0)) {
        return { error: "数量は正の数で指定してください" };
      }
      const wallet = await getWallet(userId);
      if (!wallet) {
        return {
          error: "ウォレットが未作成です。先にウォレットを作成してください",
        };
      }

      try {
        const resolved = await callSeraToolSafely(
          "sera.get_coin_metadata",
          () => resolveToken(input.token),
        );
        if (!resolved) return { error: `${input.token}は未対応のトークンです` };
        const rawAmount = parseUnits(
          input.amount,
          resolved.decimals,
        ).toString();

        const balanceCheck = await checkSufficientBalance(
          wallet.address,
          resolved.symbol,
          input.amount,
        );
        if (!balanceCheck.ok) {
          return {
            error:
              balanceCheck.reason === "insufficient_gas"
                ? FAUCET_GUIDANCE
                : tokenShortageMessage(resolved.symbol),
          };
        }

        const unsignedTx = await callSeraToolSafely(
          "onchain.build_transfer",
          () =>
            buildUnsignedTransfer({
              tokenAddress: resolved.address,
              to: input.destinationAddress,
              rawAmount,
              from: wallet.address,
            }),
        );

        const approvalId = crypto.randomUUID();
        await createApprovalRequest({
          approvalId,
          userId,
          type: "transfer",
          expiresAt:
            Math.floor(Date.now() / 1000) + TRANSFER_APPROVAL_TTL_SECONDS,
          approvedContentSnapshot: {
            network: "Ethereum Sepolia",
            token: resolved.symbol,
            amount: input.amount,
            destinationAddress: input.destinationAddress,
            tokenAddress: resolved.address,
            rawAmount,
          },
          signPayload: unsignedTx,
        });
        onApprovalCreated(approvalId);

        return {
          approvalId,
          instruction:
            "確認画面をユーザーへ提示済み。ユーザーがチャットで承認しウォレットで署名するまで、これ以上の操作は不要。",
        };
      } catch (err) {
        return { error: toUserFacingMessage(err) };
      }
    },
  });
}

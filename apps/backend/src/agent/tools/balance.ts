import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { getWallet } from "../../store/wallets.js";
import { callSeraToolSafely, toUserFacingMessage } from "../errors.js";
import { getBalances } from "../sera-tools.js";

/**
 * T037: 残高確認（読み取り専用）。FR-003, FR-004。
 * 意図的に「対象アドレス」を引数に取らない — 常に呼び出しユーザー自身の
 * ウォレットの残高のみを返す設計にすることで、他人のウォレットを問い合わせる
 * 経路自体を存在させず、所有権検証（FR-004）を構造的に担保する。
 */
export function createBalanceTool(userId: string) {
  return tool({
    name: "get_my_balance",
    description:
      "自分自身のウォレットの残高を取得する。他人のウォレットアドレスを指定しての残高確認はできない仕様であることを、ユーザーがそれを依頼した場合は伝えること。",
    inputSchema: z.void(),
    callback: async () => {
      const wallet = await getWallet(userId);
      if (!wallet) {
        return {
          hasWallet: false,
          instruction: "ウォレットが未作成。作成を提案すること。",
        };
      }
      try {
        const { balances, checked_tokens, unreadable_tokens } =
          await callSeraToolSafely("onchain.get_balances", () =>
            getBalances(wallet.address),
          );
        return {
          hasWallet: true,
          address: wallet.address,
          balances,
          note: `Seraに登録された${checked_tokens}種類のトークンとETHを確認済み。balancesに無いトークンは残高0（USDT等も対象）。ウォレット保有分のみで、SeraのVault内残高は含まない。`,
          ...(unreadable_tokens.length > 0 && {
            unreadable_tokens,
            unreadable_note:
              "これらのトークンは残高を読み取れなかった（0とは限らない）。",
          }),
        };
      } catch (err) {
        return {
          hasWallet: true,
          address: wallet.address,
          error: toUserFacingMessage(err),
        };
      }
    },
  });
}

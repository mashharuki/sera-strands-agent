import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { getWallet } from "../../store/wallets.js";

/**
 * T033: ウォレット作成はPrivy embedded walletのクライアント側操作を伴うため、
 * エージェント（サーバー側）が直接ウォレットを生成することはできない。
 * このツールは現在のウォレット所有状況をLLMへ伝えるためのものであり、
 * 実際の作成はフロントエンド（apps/frontend/src/features/wallet/createWallet.ts）が
 * Privyでウォレットを発行した後、`POST /wallet` を呼び出すことで完結する（FR-001, FR-002）。
 */
export function createWalletStatusTool(userId: string) {
  return tool({
    name: "get_wallet_status",
    description:
      "ユーザーが既にウォレットを保有しているか確認する。ウォレット作成の依頼を受けたら、まずこのツールで状況を確認すること。",
    inputSchema: z.void(),
    callback: async () => {
      const wallet = await getWallet(userId);
      if (!wallet) {
        return {
          hasWallet: false,
          instruction:
            "ウォレットは未作成。フロントエンドにPrivy embedded walletの作成を促す旨をユーザーに伝えること。",
        };
      }
      return {
        hasWallet: true,
        address: wallet.address,
        chainId: wallet.chainId,
      };
    },
  });
}

import type { Context } from "hono";
import { Hono } from "hono";
import { isAddress, parseUnits } from "viem";
import {
  checkSufficientBalance,
  FAUCET_GUIDANCE,
  tokenShortageMessage,
} from "../agent/balance-check.js";
import { refreshTransaction } from "../agent/chain-status.js";
import {
  callSeraToolSafely,
  SeraToolError,
  toUserFacingMessage,
} from "../agent/errors.js";
import {
  broadcastSignedTransfer,
  buildUnsignedTransfer,
} from "../agent/onchain-transfer.js";
import {
  parsePermitTypedData,
  verifyPermitSignature,
} from "../agent/permit-verify.js";
import { executeSwap, resolveToken } from "../agent/sera-tools.js";
import { verifySignedTransfer } from "../agent/tx-verify.js";
import type { AuthedVariables } from "../auth/privy.js";
import {
  type ApprovalRequestRecord,
  type ApprovalType,
  createApprovalRequest,
  getApprovalRequest,
  isApprovalExpired,
  updateApprovalStatus,
} from "../store/approvals.js";
import {
  claimIdempotencyKey,
  releaseIdempotencyKey,
} from "../store/idempotency.js";
import { getQuote, isQuoteExpired } from "../store/quotes.js";
import {
  createTransaction,
  getTransaction,
  listTransactionsForUser,
} from "../store/transactions.js";
import { getWallet } from "../store/wallets.js";

export const transactionRoutes = new Hono<{ Variables: AuthedVariables }>();

type Ctx = Context<{ Variables: AuthedVariables }>;

/** 送金の確認内容の有効期間（見積もりを持たないため独自に設定。FR-011）。 */
const TRANSFER_APPROVAL_TTL_SECONDS = 300;

/** `expiresAt`はDynamoDB TTL用にepoch秒で内部保存しているため、APIレスポンスではISO8601へ変換する。 */
function toApiApproval(approval: ApprovalRequestRecord) {
  return {
    ...approval,
    expiresAt: new Date(approval.expiresAt * 1000).toISOString(),
  };
}

/** チャット経由で作成されたApprovalRequestをフロントエンドの確認画面が取得するためのエンドポイント。 */
transactionRoutes.get("/transactions/approvals/:approvalId", async (c) => {
  const userId = c.get("userId");
  const approval = await getApprovalRequest(c.req.param("approvalId"));
  if (!approval || approval.userId !== userId) {
    return c.json(
      { code: "NOT_FOUND", message: "指定された承認内容が見つかりません" },
      404,
    );
  }
  return c.json(toApiApproval(approval), 200);
});

/** FR-006, FR-008: swapの確認内容を作成する。必要情報（quoteId, amount）が無ければ400。 */
transactionRoutes.post("/transactions/swap/prepare", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const { quoteId, amount } = body as { quoteId?: string; amount?: string };
  if (!quoteId || !amount) {
    return c.json(
      { code: "INVALID_REQUEST", message: "quoteId, amount is required" },
      400,
    );
  }

  const quote = await getQuote(quoteId);
  if (!quote || quote.userId !== userId) {
    return c.json(
      { code: "NOT_FOUND", message: "指定された見積もりが見つかりません" },
      404,
    );
  }
  if (isQuoteExpired(quote)) {
    return c.json(
      {
        code: "QUOTE_EXPIRED",
        message:
          "見積もりの有効期限が切れています。再度見積もりを取得してください",
      },
      409,
    );
  }
  if (quote.requiresPermit && !quote.permitPayload) {
    return c.json(
      {
        code: "PERMIT_UNAVAILABLE",
        message:
          "この見積もりはpermit署名が必要ですが、署名内容を取得できませんでした。見積もりを取り直してください",
      },
      422,
    );
  }

  const wallet = await getWallet(userId);
  if (!wallet) {
    return c.json(
      { code: "NOT_FOUND", message: "ウォレットが未作成です" },
      404,
    );
  }

  const approval = await createApprovalRequest({
    approvalId: crypto.randomUUID(),
    userId,
    type: "swap",
    quoteId,
    expiresAt: quote.expiresAt,
    approvedContentSnapshot: {
      network: "Ethereum Sepolia",
      token: quote.fromToken,
      toToken: quote.toToken,
      amount,
      estimatedFee: quote.estimatedFee,
      slippage: quote.slippage,
    },
    signPayload: quote.signPayload,
    ...(quote.requiresPermit && { permitPayload: quote.permitPayload }),
  });
  return c.json(toApiApproval(approval), 201);
});

/**
 * FR-006, FR-008: 送金の確認内容を作成する。
 * ERC-20の`transfer`をオンチェーン用に組み立てた未署名トランザクションを生成し、ユーザーのウォレット署名待ちにする。
 * 残高・ガス代不足はこの時点で検出し、faucet案内を返す（FR-016, FR-020）。
 */
transactionRoutes.post("/transactions/transfer/prepare", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const { token, amount, destinationAddress } = body as {
    token?: string;
    amount?: string;
    destinationAddress?: string;
  };
  if (!token || !amount || !destinationAddress) {
    return c.json(
      {
        code: "INVALID_REQUEST",
        message: "token, amount, destinationAddress is required",
      },
      400,
    );
  }
  if (!isAddress(destinationAddress)) {
    return c.json(
      { code: "INVALID_ADDRESS", message: "送金先アドレスの形式が不正です" },
      400,
    );
  }
  if (!(Number(amount) > 0)) {
    return c.json(
      { code: "INVALID_REQUEST", message: "amountは正の数で指定してください" },
      400,
    );
  }

  const wallet = await getWallet(userId);
  if (!wallet) {
    return c.json(
      { code: "NOT_FOUND", message: "ウォレットが未作成です" },
      404,
    );
  }

  try {
    const resolved = await callSeraToolSafely("sera.get_coin_metadata", () =>
      resolveToken(token),
    );
    if (!resolved) {
      return c.json(
        {
          code: "UNSUPPORTED_TOKEN",
          message: `${token}は未対応のトークンです`,
        },
        400,
      );
    }
    const rawAmount = parseUnits(amount, resolved.decimals).toString();

    const balanceCheck = await checkSufficientBalance(
      wallet.address,
      resolved.symbol,
      amount,
    );
    if (!balanceCheck.ok) {
      return c.json(
        {
          code: "INSUFFICIENT_BALANCE",
          message:
            balanceCheck.reason === "insufficient_gas"
              ? FAUCET_GUIDANCE
              : tokenShortageMessage(resolved.symbol),
        },
        400,
      );
    }

    const unsignedTx = await callSeraToolSafely("onchain.build_transfer", () =>
      buildUnsignedTransfer({
        tokenAddress: resolved.address,
        to: destinationAddress,
        rawAmount,
        from: wallet.address,
      }),
    );

    const approval = await createApprovalRequest({
      approvalId: crypto.randomUUID(),
      userId,
      type: "transfer",
      expiresAt: Math.floor(Date.now() / 1000) + TRANSFER_APPROVAL_TTL_SECONDS,
      approvedContentSnapshot: {
        network: "Ethereum Sepolia",
        token: resolved.symbol,
        amount,
        destinationAddress,
        tokenAddress: resolved.address,
        rawAmount,
      },
      signPayload: unsignedTx,
    });
    return c.json(toApiApproval(approval), 201);
  } catch (err) {
    if (err instanceof SeraToolError) {
      return c.json(
        { code: "SERA_UNAVAILABLE", message: toUserFacingMessage(err) },
        502,
      );
    }
    throw err;
  }
});

/**
 * swap/transfer共通のconfirm処理。
 * FR-009, FR-010, FR-011, FR-012, FR-016, FR-020。
 * approvalIdを冪等性キーとし、broadcast直前でのみclaimする。これにより
 * 「残高不足で失敗→入金後に同じapprovalIdで再試行」は妨げず、broadcastは一度しか行わせない。
 */
async function confirmApproval(
  c: Ctx,
  type: ApprovalType,
  execute: (
    approval: ApprovalRequestRecord,
    signature: string,
    walletAddress: string,
    permitSignature?: string,
  ) => Promise<{ txHash?: string } | { rejected: string }>,
) {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const { approvalId, signature, permitSignature } = body as {
    approvalId?: string;
    signature?: string;
    permitSignature?: string;
  };
  if (!approvalId) {
    return c.json(
      { code: "INVALID_REQUEST", message: "approvalId is required" },
      400,
    );
  }

  const approval = await getApprovalRequest(approvalId);
  if (!approval || approval.userId !== userId || approval.type !== type) {
    return c.json(
      { code: "NOT_FOUND", message: "指定された承認内容が見つかりません" },
      404,
    );
  }

  if (approval.status === "executed") {
    const existingTx = await getTransaction(approvalId);
    if (existingTx) return c.json(existingTx, 202);
  }

  if (isApprovalExpired(approval)) {
    await updateApprovalStatus(approvalId, "expired");
    return c.json(
      {
        code: "APPROVAL_EXPIRED",
        message: "確認内容の有効期限が切れています。再度依頼してください",
      },
      409,
    );
  }

  if (approval.quoteId) {
    const quote = await getQuote(approval.quoteId);
    if (!quote || isQuoteExpired(quote)) {
      await updateApprovalStatus(approvalId, "expired");
      return c.json(
        {
          code: "QUOTE_EXPIRED",
          message:
            "見積もりの有効期限が切れています。再度見積もりを取得してください",
        },
        409,
      );
    }
  }

  if (!signature) {
    return c.json(
      { code: "SIGNATURE_REQUIRED", message: "ウォレットでの署名が必要です" },
      400,
    );
  }

  const wallet = await getWallet(userId);
  if (!wallet) {
    return c.json(
      { code: "NOT_FOUND", message: "ウォレットが未作成です" },
      404,
    );
  }

  const snapshot = approval.approvedContentSnapshot;
  const balanceCheck = await checkSufficientBalance(
    wallet.address,
    snapshot.token,
    snapshot.amount,
  );
  if (!balanceCheck.ok) {
    const message =
      balanceCheck.reason === "insufficient_gas"
        ? FAUCET_GUIDANCE
        : tokenShortageMessage(snapshot.token);
    return c.json({ code: "INSUFFICIENT_BALANCE", message }, 400);
  }

  const claimed = await claimIdempotencyKey(approvalId);
  if (!claimed) {
    const existingTx = await getTransaction(approvalId);
    if (existingTx) return c.json(existingTx, 202);
    return c.json(
      {
        code: "DUPLICATE_IN_PROGRESS",
        message: "処理中です。しばらくしてから結果を確認してください",
      },
      409,
    );
  }

  try {
    const result = await execute(
      approval,
      signature,
      wallet.address,
      permitSignature,
    );
    if ("rejected" in result) {
      // 検証で弾いた場合もbroadcastには至っていないためキーを解放する。
      await releaseIdempotencyKey(approvalId);
      return c.json(
        { code: "CONTENT_MISMATCH", message: result.rejected },
        400,
      );
    }
    const tx = await createTransaction({
      transactionId: approvalId,
      approvalId,
      userId,
      type,
      txHash: result.txHash,
    });
    await updateApprovalStatus(approvalId, "executed");
    return c.json(tx, 202);
  } catch (err) {
    // broadcast自体には至っていないため、正当な再試行を妨げないようキーを解放する。
    await releaseIdempotencyKey(approvalId);
    if (err instanceof SeraToolError) {
      return c.json(
        {
          code: type === "swap" ? "SWAP_FAILED" : "TRANSFER_FAILED",
          message: toUserFacingMessage(err),
        },
        502,
      );
    }
    throw err;
  }
}

function pickTxHash(result: unknown): string | undefined {
  const r = result as { tx_hash?: string; txHash?: string } | undefined;
  return r?.tx_hash ?? r?.txHash;
}

/** FR-009, FR-010, FR-012: 承認・署名済みのswapを実行する。 */
transactionRoutes.post("/transactions/swap/confirm", (c) =>
  confirmApproval(
    c,
    "swap",
    async (approval, signature, walletAddress, permitSignature) => {
      let permit: { signature: string; deadline: number } | undefined;
      if (approval.permitPayload) {
        const typed = parsePermitTypedData(approval.permitPayload);
        if (!typed) return { rejected: "permitの内容を解釈できません" };
        if (!permitSignature) {
          return { rejected: "permitへのウォレット署名が必要です" };
        }
        // Sera送信前に、permit署名がユーザー自身のウォレットのものであることを検証する（FR-010）。
        const verified = await verifyPermitSignature(
          typed,
          permitSignature,
          walletAddress,
        );
        if (!verified.ok) return { rejected: verified.reason };
        permit = { signature: permitSignature, deadline: verified.deadline };
      }
      const result = await callSeraToolSafely("sera.execute_swap", () =>
        executeSwap(approval.quoteId as string, signature, permit),
      );
      return { txHash: pickTxHash(result) };
    },
  ),
);

/**
 * FR-009, FR-010, FR-012: 承認・署名済みの送金を実行する。
 * `signature`には、ユーザーのウォレットが署名した**raw transaction(hex)**を渡す。
 * ブロードキャスト前に、宛先・数量・トークン・署名者が承認内容と一致することを検証する（FR-010）。
 */
transactionRoutes.post("/transactions/transfer/confirm", (c) =>
  confirmApproval(c, "transfer", async (approval, rawTx, walletAddress) => {
    const s = approval.approvedContentSnapshot;
    if (!s.tokenAddress || !s.rawAmount || !s.destinationAddress) {
      return { rejected: "承認内容が不完全なため実行できません" };
    }
    const verification = await verifySignedTransfer(rawTx, {
      tokenAddress: s.tokenAddress,
      recipient: s.destinationAddress,
      rawAmount: s.rawAmount,
      from: walletAddress,
    });
    if (!verification.ok) return { rejected: verification.reason };

    const result = await callSeraToolSafely("onchain.send_transfer", () =>
      broadcastSignedTransfer(rawTx),
    );
    return { txHash: pickTxHash(result) };
  }),
);

const MAX_REFRESH_PER_LIST = 10;

/**
 * FR-015: 自分の取引一覧。未確定の取引は実際の状態を照会して反映する（最大件数を制限）。
 * 照会に失敗した取引は状態を更新せず、`statusCheckError`で古い可能性を伝える（FR-014）。
 */
transactionRoutes.get("/transactions", async (c) => {
  const userId = c.get("userId");
  const records = await listTransactionsForUser(userId);
  let budget = MAX_REFRESH_PER_LIST;
  const results = await Promise.all(
    records.map((tx) => {
      if (tx.chainState === "broadcast_pending" && budget > 0) {
        budget -= 1;
        return refreshTransaction(tx);
      }
      return Promise.resolve({ transaction: tx, refreshError: undefined });
    }),
  );
  return c.json(
    results.map((r) => ({
      ...r.transaction,
      statusCheckError: r.refreshError,
    })),
    200,
  );
});

/** FR-013, FR-014, FR-015: 特定の取引の状態・結果。オンチェーン/決済の実状態のみを根拠にする。 */
transactionRoutes.get("/transactions/:transactionId", async (c) => {
  const userId = c.get("userId");
  const tx = await getTransaction(c.req.param("transactionId"));
  if (!tx || tx.userId !== userId) {
    return c.json(
      { code: "NOT_FOUND", message: "指定された取引が見つかりません" },
      404,
    );
  }
  const { transaction, refreshError } = await refreshTransaction(tx);
  return c.json({ ...transaction, statusCheckError: refreshError }, 200);
});

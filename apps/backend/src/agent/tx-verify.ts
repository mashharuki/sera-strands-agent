import {
  decodeFunctionData,
  erc20Abi,
  getAddress,
  type Hex,
  parseTransaction,
  recoverTransactionAddress,
} from "viem";

export interface ExpectedTransfer {
  /** ERC-20コントラクトアドレス */
  tokenAddress: string;
  recipient: string;
  /** 最小単位(uint256)の10進文字列 */
  rawAmount: string;
  /** 署名者として期待するウォレットアドレス（ユーザー自身） */
  from: string;
}

export type TransferVerification = { ok: true } | { ok: false; reason: string };

/**
 * FR-010: `sera.send_transfer`は署名済みraw_txをそのままブロードキャストするため、
 * クライアントが承認内容と異なる宛先・数量・トークンで署名していても検知できない。
 * ブロードキャスト前に、raw_txをデコードして承認済みスナップショットと突き合わせる。
 */
export async function verifySignedTransfer(
  rawTx: string,
  expected: ExpectedTransfer,
): Promise<TransferVerification> {
  try {
    const serialized = rawTx as Hex;
    const tx = parseTransaction(serialized);

    if (!tx.to || getAddress(tx.to) !== getAddress(expected.tokenAddress)) {
      return {
        ok: false,
        reason: "送信先コントラクトが承認内容と一致しません",
      };
    }
    if (tx.value && tx.value !== 0n) {
      return { ok: false, reason: "ネイティブトークンの送付が含まれています" };
    }
    if (!tx.data) {
      return { ok: false, reason: "呼び出しデータがありません" };
    }

    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
    if (decoded.functionName !== "transfer") {
      return {
        ok: false,
        reason: "transfer以外の関数呼び出しが含まれています",
      };
    }
    const [recipient, amount] = decoded.args as readonly [string, bigint];
    if (getAddress(recipient) !== getAddress(expected.recipient)) {
      return { ok: false, reason: "宛先が承認内容と一致しません" };
    }
    if (amount !== BigInt(expected.rawAmount)) {
      return { ok: false, reason: "数量が承認内容と一致しません" };
    }

    const signer = await recoverTransactionAddress({
      serializedTransaction: serialized as never,
    });
    if (getAddress(signer) !== getAddress(expected.from)) {
      return {
        ok: false,
        reason: "署名者がユーザー自身のウォレットではありません",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: "署名済みトランザクションを検証できませんでした",
    };
  }
}

import { getAddress, type Hex, recoverTypedDataAddress } from "viem";

/**
 * Seraの見積が返すEIP-2612 permit（`permit.eip712`）。ウォレット保有分のswapで、
 * 入力トークンがpermit対応の場合に、ユーザーの追加署名が必要になる。
 */
export type PermitTypedData = {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  primaryType: "Permit";
  types: { Permit: Array<{ name: string; type: string }> };
  message: Record<string, string | number>;
};

export type PermitVerification =
  | { ok: true; deadline: number }
  | { ok: false; reason: string };

/** 応答の形を検証して、署名に使える型にする。解釈できなければundefined。 */
export function parsePermitTypedData(
  raw: unknown,
): PermitTypedData | undefined {
  const p = raw as Partial<PermitTypedData> | undefined;
  if (!p || p.primaryType !== "Permit") return undefined;
  if (!p.domain || !p.types?.Permit || !p.message) return undefined;
  if (!Array.isArray(p.types.Permit)) return undefined;
  return p as PermitTypedData;
}

/** uint系のフィールドは、署名の計算のためにbigintへ変換する（JSONでは文字列/数値で来る）。 */
function toTypedMessage(permit: PermitTypedData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of permit.types.Permit) {
    const value = permit.message[field.name];
    out[field.name] = field.type.startsWith("uint") ? BigInt(value) : value;
  }
  return out;
}

/**
 * FR-010: クライアントが返したpermit署名が、承認時に提示したpermitの内容に対する
 * **ユーザー自身のウォレットの署名**であることを、Sera送信前に検証する。
 * あわせて、permitの`owner`がユーザー自身であることを確認する。
 */
export async function verifyPermitSignature(
  permit: PermitTypedData,
  signature: string,
  walletAddress: string,
): Promise<PermitVerification> {
  try {
    if (
      getAddress(String(permit.message.owner)) !== getAddress(walletAddress)
    ) {
      return {
        ok: false,
        reason: "permitの所有者がユーザーのウォレットと一致しません",
      };
    }
    const signer = await recoverTypedDataAddress({
      domain: {
        ...permit.domain,
        verifyingContract: permit.domain.verifyingContract as Hex,
      },
      types: permit.types,
      primaryType: "Permit",
      message: toTypedMessage(permit),
      signature: signature as Hex,
    });
    if (getAddress(signer) !== getAddress(walletAddress)) {
      return {
        ok: false,
        reason: "permit署名がユーザーのウォレットのものではありません",
      };
    }
    const deadline = Number(permit.message.deadline);
    if (!Number.isFinite(deadline)) {
      return { ok: false, reason: "permitの期限を解釈できませんでした" };
    }
    return { ok: true, deadline };
  } catch {
    return { ok: false, reason: "permit署名を検証できませんでした" };
  }
}

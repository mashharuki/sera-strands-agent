import { type QuoteRecord, saveQuote } from "../store/quotes.js";
import { callSeraToolSafely } from "./errors.js";
import { parsePermitTypedData } from "./permit-verify.js";
import { buildSwapTypedData, getQuote } from "./sera-tools.js";

const FALLBACK_TTL_SECONDS = 120;

function toEpochSeconds(value: string | number | undefined): number {
  if (typeof value === "number")
    return value > 1e12 ? Math.floor(value / 1000) : value;
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber))
      return asNumber > 1e12 ? Math.floor(asNumber / 1000) : asNumber;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return Math.floor(Date.now() / 1000) + FALLBACK_TTL_SECONDS;
}

export type IssueQuoteResult =
  | { ok: true; quote: QuoteRecord }
  | { ok: false; reason: "no_uuid" };

/**
 * `sera.get_quote`で見積もりを取得し、DynamoDBへ保存する（FR-005, FR-011）。
 * 署名対象のEIP-712 typed data（domain+types+route_params）もここで組み立てて保持する。
 * 呼び出しはルート／チャットツールの双方から共通利用する。
 */
export async function issueQuote(args: {
  userId: string;
  ownerAddress: string;
  from: string;
  to: string;
  amount: string;
}): Promise<IssueQuoteResult> {
  const raw = await callSeraToolSafely("sera.get_quote", () =>
    getQuote({
      from: args.from,
      to: args.to,
      amount: args.amount,
      ownerAddress: args.ownerAddress,
    }),
  );
  if (!raw?.uuid) return { ok: false, reason: "no_uuid" };

  const input = Number(raw.human?.input);
  const minOut = Number(raw.human?.min_output);
  const estimatedRate =
    Number.isFinite(input) && input > 0 && Number.isFinite(minOut)
      ? String(minOut / input)
      : "";

  // permit_required=false（許可額が足りている等）なら追加署名は不要。
  const permitEnvelope = raw.permit as
    | { permit_required?: boolean; eip712?: unknown }
    | null
    | undefined;
  const needsPermit =
    permitEnvelope != null && permitEnvelope.permit_required !== false;
  const permitPayload = needsPermit
    ? parsePermitTypedData(permitEnvelope?.eip712)
    : undefined;
  if (needsPermit && !permitPayload) {
    // permitが必要なのに署名対象を解釈できない場合は、黙って進めずに失敗させる。
    throw new Error(
      "Sera quote requires a permit but its EIP-712 payload could not be parsed",
    );
  }

  const quote: QuoteRecord = {
    quoteId: raw.uuid,
    userId: args.userId,
    fromToken: raw.from?.symbol ?? args.from,
    toToken: raw.to?.symbol ?? args.to,
    amount: args.amount,
    estimatedRate,
    estimatedFee:
      raw.fee_breakdown === undefined
        ? undefined
        : typeof raw.fee_breakdown === "string"
          ? raw.fee_breakdown
          : JSON.stringify(raw.fee_breakdown),
    expiresAt: toEpochSeconds(raw.expires_at),
    status: "issued",
    requiresPermit: needsPermit,
    ...(permitPayload && { permitPayload }),
    signPayload: await buildSwapTypedData(raw.route_params),
  };
  await saveQuote(quote);
  return { ok: true, quote };
}

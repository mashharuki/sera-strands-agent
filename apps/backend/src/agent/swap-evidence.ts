import { createPublicClient, http, parseAbiItem } from "viem";
import { sepolia } from "viem/chains";
import type { SwapEvidenceParams } from "../store/transactions.js";

/**
 * swapの決済確認（Seraの認証付きAPI・APIキー不要の代替）。
 *
 * swapが決済されると、ウォレットの入力トークンがSera側へ動き（Transfer from=taker）、
 * 出力トークンが受取先へ入る（Transfer to=recipient）ERC-20のTransferイベントがチェーンに残る。
 * 署名した見積の`route_params`（入力/出力トークン・最大入力額・最小受取額・受取先）と突き合わせ、
 * 両方が見つかったときだけ「決済された」とみなす。片方だけでは成功と見なさない。
 * 根拠はオンチェーンのログのみで、LLMの文章やSeraの応答は使わない（憲章 原則IV）。
 */

const SEPOLIA_BLOCK_SECONDS = 12;
/** 経過時間から推定した開始ブロックに足す余裕（ブロック数）。 */
const BLOCK_MARGIN = 100;

export type TransferReader = {
  latestBlock: () => Promise<bigint>;
  /** 指定トークンのTransferの値（最小単位）。`from`/`to`のいずれかで絞る。 */
  getTransferValues: (args: {
    token: string;
    from?: string;
    to?: string;
    fromBlock: bigint;
  }) => Promise<bigint[]>;
};

export type SwapCheck = "settled" | "not_found";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

function defaultReader(): TransferReader {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is not set");
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  return {
    latestBlock: () => client.getBlockNumber(),
    getTransferValues: async ({ token, from, to, fromBlock }) => {
      const logs = await client.getLogs({
        address: token as `0x${string}`,
        event: TRANSFER_EVENT,
        args: {
          ...(from && { from: from as `0x${string}` }),
          ...(to && { to: to as `0x${string}` }),
        },
        fromBlock,
      });
      return logs.map((l) => l.args.value as bigint);
    },
  };
}

/** 署名した見積の`signPayload`（EIP-712 typed data）から、決済確認に使う値を取り出す。 */
export function extractSwapEvidence(
  signPayload: unknown,
): SwapEvidenceParams | undefined {
  const m = (signPayload as { message?: Record<string, unknown> } | undefined)
    ?.message;
  if (!m) return undefined;
  const str = (v: unknown) =>
    typeof v === "string" || typeof v === "number" || typeof v === "bigint"
      ? String(v)
      : undefined;
  const taker = str(m.taker);
  const inputToken = str(m.inputToken);
  const outputToken = str(m.outputToken);
  const maxInputAmount = str(m.maxInputAmount);
  const minOutputAmount = str(m.minOutputAmount);
  const recipient = str(m.recipient);
  const deadline = Number(m.deadline);
  if (
    !taker ||
    !inputToken ||
    !outputToken ||
    !maxInputAmount ||
    !minOutputAmount ||
    !recipient ||
    !Number.isFinite(deadline)
  ) {
    return undefined;
  }
  return {
    taker,
    inputToken,
    outputToken,
    maxInputAmount,
    minOutputAmount,
    recipient,
    deadline,
  };
}

export async function checkSwapSettled(
  params: SwapEvidenceParams,
  broadcastAtMs: number,
  reader: TransferReader = defaultReader(),
  nowMs: number = Date.now(),
): Promise<SwapCheck> {
  const latest = await reader.latestBlock();
  const elapsedBlocks = BigInt(
    Math.ceil(
      Math.max(0, nowMs - broadcastAtMs) / 1000 / SEPOLIA_BLOCK_SECONDS,
    ),
  );
  const back = elapsedBlocks + BigInt(BLOCK_MARGIN);
  const fromBlock = latest > back ? latest - back : 0n;

  const [inputs, outputs] = await Promise.all([
    reader.getTransferValues({
      token: params.inputToken,
      from: params.taker,
      fromBlock,
    }),
    reader.getTransferValues({
      token: params.outputToken,
      to: params.recipient,
      fromBlock,
    }),
  ]);

  const maxInput = BigInt(params.maxInputAmount);
  const minOutput = BigInt(params.minOutputAmount);
  const inputMoved = inputs.some((v) => v > 0n && v <= maxInput);
  const outputReceived = outputs.some((v) => v >= minOutput && v > 0n);
  return inputMoved && outputReceived ? "settled" : "not_found";
}

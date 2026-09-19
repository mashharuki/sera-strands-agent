import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  http,
  toHex,
} from "viem";
import { sepolia } from "viem/chains";

/**
 * 送金はSeraの認証付きAPI（`/transfer`・`/transfer/send`はAPI Key必須）を使わず、
 * ERC-20の`transfer`をviemで組み立て、署名済みtxをRPCへ直接ブロードキャストする。
 * 署名はユーザーのウォレット（非カストディアル）。承認内容との一致は
 * tx-verify.ts（verifySignedTransfer）がブロードキャスト前に検証する。
 */

/** Privyの`signTransaction`にそのまま渡せる、JSONで表せる未署名txの形。 */
export type UnsignedTransfer = {
  to: string;
  data: string;
  value: string;
  chainId: number;
  nonce: number;
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  type: 2;
};

export type ChainClient = {
  getNonce: (address: `0x${string}`) => Promise<number>;
  estimateGas: (args: {
    from: `0x${string}`;
    to: `0x${string}`;
    data: Hex;
  }) => Promise<bigint>;
  estimateFees: () => Promise<{
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }>;
  sendRaw: (rawTx: Hex) => Promise<Hex>;
};

/** ガス見積もりに足す余裕（%）。見積もりぎりぎりでのout-of-gasを避ける。 */
const GAS_BUFFER_PERCENT = 20n;

function defaultClient(): ChainClient {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is not set");
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  return {
    getNonce: (address) =>
      client.getTransactionCount({ address, blockTag: "pending" }),
    estimateGas: ({ from, to, data }) =>
      client.estimateGas({ account: from, to, data }),
    estimateFees: async () => {
      const f = await client.estimateFeesPerGas();
      return {
        maxFeePerGas: f.maxFeePerGas,
        maxPriorityFeePerGas: f.maxPriorityFeePerGas,
      };
    },
    sendRaw: (serializedTransaction) =>
      client.sendRawTransaction({ serializedTransaction }),
  };
}

export async function buildUnsignedTransfer(
  args: {
    tokenAddress: string;
    to: string;
    /** 最小単位(uint256)の10進文字列 */
    rawAmount: string;
    from: string;
  },
  client: ChainClient = defaultClient(),
): Promise<UnsignedTransfer> {
  const token = args.tokenAddress as `0x${string}`;
  const from = args.from as `0x${string}`;
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [args.to as `0x${string}`, BigInt(args.rawAmount)],
  });
  const [nonce, gas, fees] = await Promise.all([
    client.getNonce(from),
    client.estimateGas({ from, to: token, data }),
    client.estimateFees(),
  ]);
  return {
    to: token,
    data,
    value: "0x0",
    chainId: sepolia.id,
    nonce,
    gasLimit: toHex((gas * (100n + GAS_BUFFER_PERCENT)) / 100n),
    maxFeePerGas: toHex(fees.maxFeePerGas),
    maxPriorityFeePerGas: toHex(fees.maxPriorityFeePerGas),
    type: 2,
  };
}

/** 署名済みraw txをRPCへ送る。同じtxの再送は同じハッシュになる（冪等）。 */
export async function broadcastSignedTransfer(
  rawTx: string,
  client: ChainClient = defaultClient(),
): Promise<{ tx_hash: string }> {
  const hash = await client.sendRaw(rawTx as Hex);
  return { tx_hash: hash };
}

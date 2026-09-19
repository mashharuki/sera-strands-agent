import { describe, expect, it } from "vitest";
import {
  checkSwapSettled,
  extractSwapEvidence,
  type TransferReader,
} from "../../src/agent/swap-evidence";

const params = {
  taker: "0x1111111111111111111111111111111111111111",
  inputToken: "0x2222222222222222222222222222222222222222",
  outputToken: "0x3333333333333333333333333333333333333333",
  maxInputAmount: "10000000",
  minOutputAmount: "600000",
  recipient: "0x1111111111111111111111111111111111111111",
  deadline: 1_900_000_000,
};

function reader(input: bigint[], output: bigint[]): TransferReader {
  return {
    latestBlock: async () => 10_000n,
    getTransferValues: async ({ token }) =>
      token === params.inputToken ? input : output,
  };
}

describe("checkSwapSettled", () => {
  it("should report settled when the input left and the output arrived", async () => {
    expect(
      await checkSwapSettled(
        params,
        Date.now(),
        reader([10_000_000n], [699_943n]),
      ),
    ).toBe("settled");
  });

  it("should not report settled from the input transfer alone", async () => {
    expect(
      await checkSwapSettled(params, Date.now(), reader([10_000_000n], [])),
    ).toBe("not_found");
  });

  it("should not report settled from the output transfer alone", async () => {
    expect(
      await checkSwapSettled(params, Date.now(), reader([], [699_943n])),
    ).toBe("not_found");
  });

  it("should ignore transfers outside the signed limits", async () => {
    // 入力が上限超過、出力が最小受取額未満
    expect(
      await checkSwapSettled(params, Date.now(), reader([99_000_000n], [1n])),
    ).toBe("not_found");
  });

  it("should search from a block derived from the elapsed time", async () => {
    let seenFrom = -1n;
    const r: TransferReader = {
      latestBlock: async () => 10_000n,
      getTransferValues: async ({ fromBlock }) => {
        seenFrom = fromBlock;
        return [];
      },
    };
    const now = 1_000_000_000;
    await checkSwapSettled(params, now - 120_000, r, now); // 120秒 = 10ブロック + 余裕100
    expect(seenFrom).toBe(10_000n - 110n);
  });
});

describe("extractSwapEvidence", () => {
  it("should read the signed quote's Intent message", () => {
    const evidence = extractSwapEvidence({
      message: {
        taker: params.taker,
        inputToken: params.inputToken,
        outputToken: params.outputToken,
        maxInputAmount: "10000000",
        minOutputAmount: 600000,
        recipient: params.recipient,
        deadline: 1_900_000_000,
      },
    });
    expect(evidence).toEqual(params);
  });

  it("should return undefined when required fields are missing", () => {
    expect(extractSwapEvidence({ message: { taker: "0x1" } })).toBeUndefined();
    expect(extractSwapEvidence(undefined)).toBeUndefined();
  });
});

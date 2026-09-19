import type { privateKeyToAccount } from "viem/accounts";
import type { PermitTypedData } from "../../src/agent/permit-verify";

export function permitFor(owner: string): PermitTypedData {
  return {
    domain: {
      name: "MYRT",
      version: "1",
      chainId: 11155111,
      verifyingContract: "0x66d3b49b587b970b5835751708136adb805f1fe4",
    },
    primaryType: "Permit",
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    message: {
      owner,
      spender: "0x1111111111111111111111111111111111111111",
      value: "10000000",
      nonce: 0,
      deadline: 1_900_000_000,
    },
  };
}

/** サーバーと同じ型変換（uintはbigint）でユーザーのウォレットが署名する。 */
export async function signPermit(
  account: ReturnType<typeof privateKeyToAccount>,
  permit: PermitTypedData,
) {
  return account.signTypedData({
    domain: {
      ...permit.domain,
      verifyingContract: permit.domain.verifyingContract as `0x${string}`,
    },
    types: permit.types,
    primaryType: "Permit",
    message: {
      owner: permit.message.owner as `0x${string}`,
      spender: permit.message.spender as `0x${string}`,
      value: BigInt(permit.message.value),
      nonce: BigInt(permit.message.nonce),
      deadline: BigInt(permit.message.deadline),
    },
  });
}

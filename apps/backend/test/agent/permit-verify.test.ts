import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  parsePermitTypedData,
  verifyPermitSignature,
} from "../../src/agent/permit-verify";
import { permitFor, signPermit } from "../helpers/permit";

const user = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());

describe("verifyPermitSignature", () => {
  it("should accept a signature made by the user's own wallet and return the deadline", async () => {
    const permit = permitFor(user.address);
    const sig = await signPermit(user, permit);
    expect(await verifyPermitSignature(permit, sig, user.address)).toEqual({
      ok: true,
      deadline: 1_900_000_000,
    });
  });

  it("should reject a signature made by a different wallet", async () => {
    const permit = permitFor(user.address);
    const sig = await signPermit(other, permit);
    const res = await verifyPermitSignature(permit, sig, user.address);
    expect(res.ok).toBe(false);
  });

  it("should reject when the permit owner is not the user's wallet", async () => {
    const permit = permitFor(other.address);
    const sig = await signPermit(user, permit);
    const res = await verifyPermitSignature(permit, sig, user.address);
    expect(res).toMatchObject({ ok: false });
  });

  it("should reject a signature over different permit contents", async () => {
    const signed = permitFor(user.address);
    const sig = await signPermit(user, signed);
    const tampered = permitFor(user.address);
    tampered.message.value = "999999999999";
    const res = await verifyPermitSignature(tampered, sig, user.address);
    expect(res.ok).toBe(false);
  });

  it("should reject garbage signatures without throwing", async () => {
    const res = await verifyPermitSignature(
      permitFor(user.address),
      "0x1234",
      user.address,
    );
    expect(res.ok).toBe(false);
  });
});

describe("parsePermitTypedData", () => {
  it("should return undefined for payloads that are not a Permit", () => {
    expect(parsePermitTypedData(undefined)).toBeUndefined();
    expect(parsePermitTypedData({ primaryType: "Intent" })).toBeUndefined();
  });
});

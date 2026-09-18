import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { docClient } from "../../src/store/client.js";
import { createWalletIfAbsent } from "../../src/store/wallets.js";

process.env.TABLE_NAME = "test-table";

const ddbMock = mockClient(docClient);

describe("createWalletIfAbsent", () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it("should create a wallet when none exists yet (FR-001)", async () => {
    ddbMock.on(PutCommand).resolves({});

    const result = await createWalletIfAbsent("user-1", "0xabc", 11155111);

    expect(result.created).toBe(true);
    expect(result.wallet.address).toBe("0xabc");
  });

  it("should not create a duplicate wallet and return the existing one when userId already has a wallet (FR-002)", async () => {
    ddbMock
      .on(PutCommand)
      .rejects(
        new ConditionalCheckFailedException({
          message: "conditional check failed",
          $metadata: {},
        }),
      );
    ddbMock.on(GetCommand).resolves({
      Item: {
        userId: "user-1",
        address: "0xexisting",
        chainId: 11155111,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const result = await createWalletIfAbsent(
      "user-1",
      "0xnew-attempt",
      11155111,
    );

    expect(result.created).toBe(false);
    expect(result.wallet.address).toBe("0xexisting");
  });
});

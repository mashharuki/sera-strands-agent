import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadSeraCredentials,
  parseSeraSecret,
  resetSeraCredentialsCache,
} from "../../src/agent/sera-auth";

const smMock = mockClient(SecretsManagerClient);

describe("parseSeraSecret", () => {
  it("should return credentials when both fields are set", () => {
    expect(parseSeraSecret('{"apiKey":"k","apiSecret":"s"}')).toEqual({
      ok: true,
      credentials: { apiKey: "k", apiSecret: "s" },
    });
  });

  it("should report not-configured when the CDK placeholder is empty", () => {
    expect(parseSeraSecret('{"apiKey":"","apiSecret":""}')).toEqual({
      ok: false,
      reason: "not-configured",
    });
    expect(parseSeraSecret(undefined)).toEqual({
      ok: false,
      reason: "not-configured",
    });
  });

  it("should report invalid when the JSON shape is wrong", () => {
    expect(parseSeraSecret("not json").ok).toBe(false);
    expect(parseSeraSecret('{"apiKey":1,"apiSecret":"s"}')).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("loadSeraCredentials", () => {
  beforeEach(() => {
    smMock.reset();
    resetSeraCredentialsCache();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.SERA_SECRET_ID;
    vi.restoreAllMocks();
  });

  it("should skip Secrets Manager when SERA_SECRET_ID is unset", async () => {
    await expect(loadSeraCredentials()).resolves.toBeUndefined();
    expect(smMock.commandCalls(GetSecretValueCommand)).toHaveLength(0);
  });

  it("should fetch once and cache credentials when the secret is configured", async () => {
    process.env.SERA_SECRET_ID = "arn:test";
    smMock
      .on(GetSecretValueCommand)
      .resolves({ SecretString: '{"apiKey":"k","apiSecret":"s"}' });
    const first = await loadSeraCredentials();
    const second = await loadSeraCredentials();
    expect(first).toEqual({ apiKey: "k", apiSecret: "s" });
    expect(second).toEqual(first);
    expect(smMock.commandCalls(GetSecretValueCommand)).toHaveLength(1);
  });

  it("should return undefined when the secret is still the empty placeholder", async () => {
    process.env.SERA_SECRET_ID = "arn:test";
    smMock
      .on(GetSecretValueCommand)
      .resolves({ SecretString: '{"apiKey":"","apiSecret":""}' });
    await expect(loadSeraCredentials()).resolves.toBeUndefined();
  });

  it("should throw when the secret has an invalid shape", async () => {
    process.env.SERA_SECRET_ID = "arn:test";
    smMock.on(GetSecretValueCommand).resolves({ SecretString: "oops" });
    await expect(loadSeraCredentials()).rejects.toThrow(/apiKey/);
  });

  it("should retry on the next call when the fetch fails", async () => {
    process.env.SERA_SECRET_ID = "arn:test";
    smMock.on(GetSecretValueCommand).rejectsOnce(new Error("throttled"));
    await expect(loadSeraCredentials()).rejects.toThrow("throttled");
    smMock
      .on(GetSecretValueCommand)
      .resolves({ SecretString: '{"apiKey":"k","apiSecret":"s"}' });
    await expect(loadSeraCredentials()).resolves.toEqual({
      apiKey: "k",
      apiSecret: "s",
    });
  });
});

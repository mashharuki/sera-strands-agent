import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

export type SeraCredentials = { apiKey: string; apiSecret: string };

type LoadResult =
  | { ok: true; credentials: SeraCredentials }
  | { ok: false; reason: "not-configured" | "invalid" };

let cached: Promise<LoadResult> | undefined;

/** SecretString(JSON)を検証する。CDKが作る空のプレースホルダーは「未設定」として扱う。 */
export function parseSeraSecret(secretString: string | undefined): LoadResult {
  if (!secretString) return { ok: false, reason: "not-configured" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(secretString);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "invalid" };
  }
  const { apiKey, apiSecret } = parsed as Record<string, unknown>;
  if (typeof apiKey !== "string" || typeof apiSecret !== "string") {
    return { ok: false, reason: "invalid" };
  }
  if (apiKey === "" || apiSecret === "") {
    return { ok: false, reason: "not-configured" };
  }
  return { ok: true, credentials: { apiKey, apiSecret } };
}

async function fetchSecret(secretId: string): Promise<LoadResult> {
  try {
    const client = new SecretsManagerClient({});
    const res = await client.send(
      new GetSecretValueCommand({ SecretId: secretId }),
    );
    return parseSeraSecret(res.SecretString);
  } catch (error) {
    // 値は含めず、原因の種別だけをログに残す
    console.error("[sera-auth] failed to read secret", {
      secretId,
      name: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}

/**
 * Sera運用者資格情報をSecrets Manager（`SERA_SECRET_ID`）から取得する。
 * - `SERA_SECRET_ID` 未設定（ローカル開発など）: `SERA_API_KEY/SECRET` 環境変数をそのまま使うため undefined。
 * - 空のプレースホルダー: 未設定として undefined（資格情報不要の読み取りツールは動く）。
 * - 形式不正: 例外（設定ミスを黙って無視しない）。
 * Lambdaのウォームスタートで再取得しないよう、成功結果のみキャッシュする。
 */
export async function loadSeraCredentials(): Promise<
  SeraCredentials | undefined
> {
  const secretId = process.env.SERA_SECRET_ID;
  if (!secretId) return undefined;

  cached ??= fetchSecret(secretId);
  let result: LoadResult;
  try {
    result = await cached;
  } catch (error) {
    cached = undefined; // 一時的な失敗は次回再試行
    throw error;
  }
  if (result.ok) return result.credentials;
  if (result.reason === "invalid") {
    throw new Error(
      'Sera secret must be JSON like {"apiKey":"...","apiSecret":"..."}',
    );
  }
  console.warn(
    "[sera-auth] Sera credentials are not configured in Secrets Manager; tools requiring operator credentials will fail.",
  );
  return undefined;
}

export function resetSeraCredentialsCache(): void {
  cached = undefined;
}

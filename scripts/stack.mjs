// デプロイ/削除の一貫実行スクリプト（T075）。
//   pnpm stack:deploy  -- --stage <stage>
//   pnpm stack:destroy -- --stage <stage>
//
// 注意: `pnpm deploy` はpnpm組み込みコマンドと衝突するため `stack:*` という名前にしている。
// このスクリプトはAWSへ実際にリソースを作成/削除する。ステージ指定は必須（誤操作防止）。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cdkBin = resolve(root, "apps/cdk/node_modules/.bin/cdk");
const outputsFile = resolve(root, "apps/cdk/cdk.out/outputs.json");

// ルートの .env があれば読み込む（既に設定済みの環境変数は上書きしない）。
if (existsSync(resolve(root, ".env"))) {
  process.loadEnvFile(resolve(root, ".env"));
}

const [mode, ...rest] = process.argv.slice(2);
const stageIdx = rest.indexOf("--stage");
const stage = stageIdx >= 0 ? rest[stageIdx + 1] : undefined;

if (
  !["deploy", "destroy"].includes(mode) ||
  !stage ||
  !/^[a-z0-9-]+$/.test(stage)
) {
  console.error(
    "usage: node scripts/stack.mjs <deploy|destroy> --stage <stage>  (stage: 小文字英数字とハイフン)",
  );
  process.exit(1);
}

const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
const cdk = (args, env) =>
  run(cdkBin, [...args, "--context", `stage=${stage}`], env);
const stackName = (name) => `SeraChatbot-${stage}-${name}`;

function readOutputs() {
  const json = JSON.parse(readFileSync(outputsFile, "utf8"));
  return {
    apiUrl: json[stackName("Backend")]?.ApiUrl,
    chatUrl: json[stackName("Backend")]?.ChatUrl,
    secretArn: json[stackName("Backend")]?.SeraSecretArn,
    siteUrl: json[stackName("Frontend")]?.SiteUrl,
  };
}

if (mode === "destroy") {
  // このステージのスタックだけを対象にする（cdkの確認プロンプトは省略しない）。
  cdk([
    "destroy",
    stackName("Frontend"),
    stackName("Backend"),
    stackName("Data"),
  ]);
  process.exit(0);
}

// 1. OpenAPIから型を再生成（生成物の整合性はCIでも確認する）
run("pnpm", ["--filter", "api-spec", "run", "generate"]);
// 2. sera-mcpのバンドル（無ければ作る）
if (!existsSync(resolve(root, "apps/backend/vendor-dist/sera-mcp.mjs"))) {
  run("pnpm", ["build:sera-mcp"]);
}
mkdirSync(dirname(outputsFile), { recursive: true });

// 3. フロントエンドのビルドにはバックエンドのURLが必要なため、先にData+Backendをデプロイする。
//    FrontendStackは apps/frontend/dist の存在を前提とするので、初回はダミーのdistを避けるため
//    Backendまでを個別に指定する。
cdk([
  "deploy",
  stackName("Data"),
  stackName("Backend"),
  "--outputs-file",
  outputsFile,
  "--require-approval",
  "never",
]);
const { apiUrl, chatUrl } = readOutputs();
if (!apiUrl || !chatUrl) {
  throw new Error(
    "BackendスタックのOutput(ApiUrl/ChatUrl)を取得できませんでした。",
  );
}

// 4. フロントエンドをビルド（VITE_PRIVY_APP_IDは呼び出し元の環境から引き継ぐ）
run("pnpm", ["--filter", "frontend", "build"], {
  VITE_API_URL: apiUrl,
  VITE_CHAT_URL: chatUrl,
});

// 5. フロントエンド配信（S3 + CloudFront）
cdk([
  "deploy",
  stackName("Frontend"),
  "--outputs-file",
  outputsFile,
  "--require-approval",
  "never",
]);

// outputs-fileは後から実行したdeployの内容で上書きされるため、URLは各実行直後に読む。
const finalOutputs = readOutputs();
console.log("\n=== デプロイ完了 ===");
console.log(`API:  ${apiUrl}`);
console.log(`Chat: ${chatUrl}`);
console.log(
  `Site: ${finalOutputs.siteUrl ?? "(Frontendスタックの出力を確認してください)"}`,
);
console.log(
  "\n次の手順: Seraの資格情報を Secrets Manager に設定してください（値はここに出力されません）。README参照。",
);

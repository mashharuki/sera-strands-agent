import { defineConfig } from "@playwright/test";

/**
 * E2Eはデプロイ済み環境に対して実行する（Privyのログインは自動化できないため）。
 * - E2E_BASE_URL: CloudFrontのURL（`pnpm stack:deploy` の出力 Site）
 * - E2E_STORAGE_STATE: ログイン済みセッションの保存先。事前に一度だけ手動で作成する:
 *     npx playwright codegen --save-storage=e2e/.auth/state.json $E2E_BASE_URL
 *   （ファイルはセッショントークンを含むため gitignore 済み。コミットしない）
 * どちらかが未設定なら、テストはスキップされる（失敗ではなく「未実施」）。
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 5 * 60_000,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "e2e/results.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    storageState: process.env.E2E_STORAGE_STATE,
    trace: "retain-on-failure",
  },
});

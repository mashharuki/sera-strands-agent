import { expect, type Page, test } from "@playwright/test";

const isConfigured = Boolean(
  process.env.E2E_BASE_URL && process.env.E2E_STORAGE_STATE,
);

test.skip(
  !isConfigured,
  "E2E_BASE_URL と E2E_STORAGE_STATE が未設定のため未実施（playwright.config.ts 参照）",
);

const SC001_LIMIT_MS = 5 * 60_000;
const SC002_MIN_RATE = 0.8;

const input = (page: Page) =>
  page.getByPlaceholder("ウォレットを作成して、など");

/** 送信し、ストリーミング完了（入力欄が再び有効）まで待つ。新しく増えたbot行のテキストを返す。 */
async function ask(page: Page, message: string): Promise<string> {
  const lines = page.locator(".chat-line--assistant");
  const before = await lines.count();
  await input(page).fill(message);
  await page.getByRole("button", { name: "送信" }).click();
  await expect(input(page)).toBeEnabled({ timeout: 120_000 });
  await expect(lines).not.toHaveCount(before);
  return (await lines.last().innerText()).trim();
}

test.describe("チャットのハッピーパス（デプロイ済み環境）", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(input(page)).toBeVisible({ timeout: 60_000 });
  });

  test("SC-001: ウォレットの用意から残高確認まで5分以内", async ({ page }) => {
    const startedAt = Date.now();
    // 作成済みのウォレットがあれば残高が表示される。未作成なら作成フローの操作が必要（手動）。
    await expect(page.getByRole("heading", { name: "残高" })).toBeVisible({
      timeout: SC001_LIMIT_MS,
    });
    const elapsed = Date.now() - startedAt;
    test.info().annotations.push({
      type: "SC-001",
      description: `${elapsed}ms`,
    });
    expect(elapsed).toBeLessThan(SC001_LIMIT_MS);
  });

  test("SC-002: 板/見積/履歴の照会が追加確認なしで回答される割合が80%以上", async ({
    page,
  }) => {
    const queries = [
      "USDCとUSDTの板を見せて",
      "USDCとUSDTの板の状況を教えて",
      "10 USDC を USDT に替えたらいくら？見積だけ教えて",
      "100 USDC を USDT に替える見積を出して",
      "直近の取引履歴を見せて",
      "最近のUSDC/USDTの取引を教えて",
      "USDTからUSDCの見積（5 USDT）を教えて",
      "板の深さ（depth）を教えて",
      "取引履歴を5件表示して",
      "USDCの残高と板を教えて",
    ];
    let answeredInOneTurn = 0;
    const details: string[] = [];
    for (const q of queries) {
      const reply = await ask(page, q);
      // 簡易判定: 回答が確認の質問（疑問符で終わる）ではなく、空でもない。
      // 厳密な評価ではなく、実測時に人手で確認するための集計。
      const isFollowUp = /[?？]\s*$/.test(reply);
      if (reply.length > 0 && !isFollowUp) answeredInOneTurn += 1;
      details.push(`${isFollowUp ? "追加確認" : "回答"}: ${q}`);
    }
    const rate = answeredInOneTurn / queries.length;
    test.info().annotations.push({
      type: "SC-002",
      description: `${answeredInOneTurn}/${queries.length} (${Math.round(rate * 100)}%)\n${details.join("\n")}`,
    });
    expect(rate).toBeGreaterThanOrEqual(SC002_MIN_RATE);
  });

  // swap / 送金はテストネットでも実際にオンチェーン取引を発生させるため、
  // 明示的に E2E_ALLOW_WRITE=1 を付けた場合のみ、確認画面の表示までを検証する（承認・署名はしない）。
  test("swap: 確認画面に必要情報が表示される（送信はしない）", async ({
    page,
  }) => {
    test.skip(
      process.env.E2E_ALLOW_WRITE !== "1",
      "E2E_ALLOW_WRITE=1 のときのみ実行",
    );
    await ask(page, "1 USDC を USDT に swap したい");
    await expect(page.getByRole("heading", { name: "swapの確認" })).toBeVisible(
      { timeout: 60_000 },
    );
  });
});

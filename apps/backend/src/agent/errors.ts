/**
 * FR-017: 外部依存先（sera-mcp/Sera Protocol）が応答しない・エラーを返す場合、
 * 成功したかのように誤って扱ってはならない。sera-mcp呼び出しはすべてこの
 * ヘルパーでラップし、失敗を明示的な `SeraToolError` として上位へ伝える。
 */
export class SeraToolError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
  ) {
    super(message);
    this.name = "SeraToolError";
  }
}

export async function callSeraToolSafely<T>(
  toolName: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // 原因（上位には汎用文言しか返さない）を運用側で追えるよう、ツール名と原因を記録する。
    console.error("[sera-tool] call failed", {
      toolName,
      cause: err instanceof Error ? err.message : String(err),
    });
    throw new SeraToolError(
      `sera-mcpツール "${toolName}" の呼び出しに失敗しました`,
      err,
    );
  }
}

/** チャットに表示する、ユーザー向けの説明文へ変換する。 */
export function toUserFacingMessage(err: unknown): string {
  if (err instanceof SeraToolError) {
    return `外部サービス（Sera Protocol）との通信でエラーが発生したため、処理を完了できませんでした。しばらくしてから再度お試しください。（${err.message}）`;
  }
  return "予期しないエラーが発生したため、処理を完了できませんでした。";
}

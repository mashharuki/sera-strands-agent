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
      // MCP SDKのStreamableHTTPErrorはHTTPステータスを`code`に持つ。
      code: (err as { code?: unknown } | undefined)?.code,
    });
    throw new SeraToolError(
      `sera-mcpツール "${toolName}" の呼び出しに失敗しました`,
      err,
    );
  }
}

/**
 * sera-mcpがツールの結果として返したエラー（`Error in sera.xxx: ...`）。入力の誤り
 * （未知のトークン等）の説明を含み、利用者が直せることが多い。通信失敗（接続エラー等）は
 * 該当しない。
 */
const TOOL_REPORTED_ERROR = /^Error in sera\./;
const MAX_DETAIL_LENGTH = 300;

/** ツールが報告した原因（あれば）。長さを制限して返す。 */
export function toolReportedDetail(err: SeraToolError): string | undefined {
  const cause = err.cause;
  if (!(cause instanceof Error) || !TOOL_REPORTED_ERROR.test(cause.message)) {
    return undefined;
  }
  return cause.message.slice(0, MAX_DETAIL_LENGTH);
}

/** チャットに表示する、ユーザー向けの説明文へ変換する。 */
export function toUserFacingMessage(err: unknown): string {
  if (err instanceof SeraToolError) {
    const detail = toolReportedDetail(err);
    if (detail) {
      return `Sera Protocolが依頼を受け付けませんでした。原因: ${detail}（入力内容（トークン名・数量など）を確認してください）`;
    }
    return `外部サービス（Sera Protocol）との通信でエラーが発生したため、処理を完了できませんでした。しばらくしてから再度お試しください。（${err.message}）`;
  }
  return "予期しないエラーが発生したため、処理を完了できませんでした。";
}

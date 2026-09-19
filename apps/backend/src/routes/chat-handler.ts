import { extractBearerToken, verifyPrivyAccessToken } from "../auth/privy.js";
import { streamChatTurn } from "./chat.js";

/**
 * Lambda Function URL（InvokeMode.RESPONSE_STREAM）専用のエントリポイント。
 * `awslambda.streamifyResponse` はLambda Node.jsランタイムが実行時にのみ
 * 提供するグローバル関数であり、ローカルNode.js環境には存在しない
 * （research.md §4.1, スパイクS2参照）。そのためこのファイルは
 * Lambda環境専用とし、ポータブルなロジックは chat.ts に分離している。
 */
declare const awslambda: {
  streamifyResponse: (
    handler: (
      event: LambdaFunctionUrlEvent,
      responseStream: NodeJS.WritableStream,
    ) => Promise<void>,
  ) => unknown;
};

interface LambdaFunctionUrlEvent {
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
}

export const handler = awslambda.streamifyResponse(
  async (event, responseStream) => {
    const auth = await verifyPrivyAccessToken(
      extractBearerToken(
        event.headers?.authorization ?? event.headers?.Authorization,
      ),
    );
    if (!auth.ok) {
      const message =
        auth.reason === "unauthenticated"
          ? "ログインが必要です"
          : "認証の設定が不正です（管理者に連絡してください）";
      responseStream.write(
        `${JSON.stringify({ eventType: "error", payload: { message } })}\n`,
      );
      responseStream.end();
      return;
    }
    const userId = auth.userId;

    const body = event.body
      ? JSON.parse(
          event.isBase64Encoded
            ? Buffer.from(event.body, "base64").toString("utf-8")
            : event.body,
        )
      : {};
    const sessionId: string = body.sessionId ?? "default";
    const message: string = body.message ?? "";

    try {
      for await (const chatEvent of streamChatTurn({
        sessionId,
        userId,
        message,
      })) {
        responseStream.write(`${JSON.stringify(chatEvent)}\n`);
      }
    } catch (error) {
      // 例外でストリームを途中切断せず、原因をログに残してエラーイベントとして返す。
      console.error("[chat] turn failed", {
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : String(error),
      });
      responseStream.write(
        `${JSON.stringify({ eventType: "error", payload: { message: "チャットの処理中にエラーが発生しました" } })}\n`,
      );
    }
    responseStream.end();
  },
);

import { verifyAccessToken } from "@privy-io/node";
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

async function verifyUser(
  event: LambdaFunctionUrlEvent,
): Promise<string | undefined> {
  const appId = process.env.PRIVY_APP_ID;
  const verificationKey = process.env.PRIVY_VERIFICATION_KEY;
  const authHeader =
    event.headers?.authorization ?? event.headers?.Authorization;
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;
  if (!appId || !verificationKey || !accessToken) return undefined;
  try {
    const claims = await verifyAccessToken({
      access_token: accessToken,
      app_id: appId,
      verification_key: verificationKey,
    });
    return claims.user_id;
  } catch {
    return undefined;
  }
}

export const handler = awslambda.streamifyResponse(
  async (event, responseStream) => {
    const userId = await verifyUser(event);
    if (!userId) {
      responseStream.write(
        `${JSON.stringify({ eventType: "error", payload: { message: "ログインが必要です" } })}\n`,
      );
      responseStream.end();
      return;
    }

    const body = event.body
      ? JSON.parse(
          event.isBase64Encoded
            ? Buffer.from(event.body, "base64").toString("utf-8")
            : event.body,
        )
      : {};
    const sessionId: string = body.sessionId ?? "default";
    const message: string = body.message ?? "";

    for await (const chatEvent of streamChatTurn({
      sessionId,
      userId,
      message,
    })) {
      responseStream.write(`${JSON.stringify(chatEvent)}\n`);
    }
    responseStream.end();
  },
);

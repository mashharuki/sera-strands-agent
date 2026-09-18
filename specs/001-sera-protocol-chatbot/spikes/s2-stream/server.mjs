// スパイクS2: レスポンスストリーミングのローカル検証用最小サーバー。
// 実際のLambda Function URL（RESPONSE_STREAM呼び出しモード）は
// `awslambda.streamifyResponse(async (event, responseStream, context) => { ... })`
// というLambda固有のグローバルAPIを使うため、このローカルNode httpサーバーで
// 完全に同一の挙動を再現することはできない。ここではNode.jsの
// ストリーミングレスポンス（chunked transfer encoding）というコアパターン自体が
// 期待通りに"逐次"クライアントへ届くことを確認する目的の最小スパイクである。
import { createServer } from "node:http";

const server = createServer(async (req, res) => {
  if (req.url !== "/chat") {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Transfer-Encoding": "chunked",
  });
  const tokens = [
    "こんにちは",
    "、",
    "ウォレット",
    "を",
    "確認",
    "します",
    "...",
  ];
  for (const token of tokens) {
    res.write(
      `${JSON.stringify({ eventType: "token", payload: { text: token } })}\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  res.write(`${JSON.stringify({ eventType: "done", payload: {} })}\n`);
  res.end();
});

const port = Number(process.env.PORT ?? 4931);
server.listen(port, "127.0.0.1", () => {
  console.log(
    `spike s2 stream server listening on http://127.0.0.1:${port}/chat`,
  );
});

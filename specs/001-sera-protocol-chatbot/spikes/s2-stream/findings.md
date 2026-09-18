# スパイクS2: レスポンスストリーミングの検証

**合格条件**: `research.md` §8 S2 — ダミーのストリーミングレスポンスをLambda Function URL経由でブラウザまで届け、トークン単位の逐次表示ができることを確認する。

**結果**: **部分合格（ローカルでのストリーミングパターン自体は実行確認済み。実際のLambda Function URL経由の疎通は、AWSアカウント・デプロイ権限が本セッションに無いため未実施）**。

## 実施内容と確認済みの事実（実行確認）

`server.mjs`（Node.js標準の`http`モジュールのみ使用）で、`Transfer-Encoding: chunked`のレスポンスを150ms間隔で7トークン＋doneイベント送出するエンドポイント`/chat`を実装し、`curl --no-buffer`で実際に呼び出した。

- 応答は`application/x-ndjson`形式（`contracts/openapi.yaml`の`ChatStreamEvent`スキーマと同じ形）で、1行ずつのJSONイベントとして届いた。
- 総所要時間は約1.07秒（7トークン×150ms≒1.05秒と整合）。これはレスポンスがサーバー側でバッファ・一括送信されたのではなく、実際に**逐次**送出されたことを示す（バッファされていれば応答完了までの体感時間は変わらないが、途中経過が見えない）。

## 未確認・推測

- 実際のAWS Lambda Function URL（`InvokeMode: RESPONSE_STREAM`）は`awslambda.streamifyResponse(handler)`というLambda Runtime固有のグローバル関数でラップする必要があり、本ローカルNode httpサーバーとはAPIが異なる。このグローバルAPIはLambda実行環境内でのみ提供されるため、ローカル環境で完全に同一のコードパスを検証することはできない。
- CloudFrontをLambda Function URLの前段に置いた場合のストリーミング挙動（CloudFrontがレスポンスをバッファしないか）は未検証。AWS環境へのデプロイ後に確認が必要。
- ブラウザ側（`fetch` + `ReadableStream`、またはEventSource相当）でのNDJSON逐次パースの実装は本スパイクの範囲外（`apps/frontend/src/features/chat/ChatShell.tsx`実装時に検証）。

**次のアクション**: AWS環境へのデプロイが可能になった時点で、`awslambda.streamifyResponse`でラップした実際のLambda Function URLに対して同様の疎通確認を行うこと（本findings.mdの追記として記録する）。

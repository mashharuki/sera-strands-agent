# スパイクS3: sera-mcp(v1) stateless HTTPモードの疎通確認

**合格条件**: `research.md` §8 S3 — `sera-mcp`(v1)を`--transport http --stateless`で起動し、`get_quote`等を単発HTTPリクエストで呼び出せることを確認する。

**結果**: **ソースコード確認により合格相当と判断（実際のネットワーク疎通は未実施）**。Seraの本番/テストネットAPIキーを持たないため、実際にサーバーを起動してHTTPリクエストを送る疎通テストはこのターンでは実施していない（外部サービスへの実トラフィックを避けるため）。以下はソースコードの直接確認による検証。

## 確認済みの事実（実コード確認、`sera-cx/sera-mcp` commit `d6f50c1aa6098354d796b777a5474989e9acc1f7`）

1. **stateless HTTPモードは実在する**: `src/index.ts`のCLI引数パーサーが`--transport http --stateless`（または環境変数`SERA_TRANSPORT=http` `SERA_HTTP_STATELESS=true`）を受け付け、`src/transports/http.ts`の`attachStreamableHttp()`が`StreamableHTTPServerTransport`を`sessionIdGenerator: undefined`で構築する（stateless時）。単一の`/mcp`エンドポイント（POST/GET/SSE/DELETE）と`/health`エンドポイントを持つExpressアプリとして起動する。

2. **重大なセキュリティ上の制約**: `src/transports/http.ts`冒頭のコメントに明記——「Auth is intentionally NOT implemented here. Going public requires OAuth 2.1 + RFC 8707... Until OAuth lands, only bind to localhost or behind a trusted reverse proxy」。さらに`enforcePublicBindGuard()`という起動時ガードが実装されており、非ループバックホスト（`127.0.0.1`/`localhost`/`::1`以外）にバインドしようとすると、`allowedHosts`指定か`SERA_HTTP_ALLOW_UNAUTHENTICATED_PUBLIC=true`の明示的アクノリッジがない限り**起動そのものを拒否する**（`process.exit(1)`）。

3. **Ethereum Sepoliaのchain ID 11155111を実コードで確認**: `src/index.ts`の起動時「network-label sanity check」で `const expected = ctx.cfg.network === "mainnet" ? 1 : 11155111;` という比較を行い、Sera側APIが返す`chain_id`と食い違えば警告ログを出す設計になっている。これにより、`SERA_NETWORK=sepolia`が**Ethereum Sepolia（chainId 11155111）を指すことが実コードで確認できた**（`research.md` §1.2・§9の未決事項の一つを解消）。

4. **ライブラリとしての再利用は非推奨**: `package.json`に`"exports"`フィールドは無く、`"main": "dist/index.js"`はトップレベルで`main().catch(...)`を即時実行するCLIエントリポイントである（importするだけでサーバーが起動してしまう副作用を持つ）。`src/server/create-server.ts`（`createServer()`関数）を直接deep-importする経路は技術的には可能（`exports`フィールドが無いためNode.jsのサブパスインポート制限を受けない）だが、これは**未公開の内部実装への依存**であり、バージョン更新で壊れるリスクがある。

## 設計判断への反映

- **推奨する呼び出し方式**: `sera-mcp`は公開インターフェース（`bin: sera-mcp` / `sera`）のまま、Lambda実行環境内で子プロセスとして`--transport http --stateless --host 127.0.0.1`起動し、同一Lambda内のHonoハンドラーから`http://127.0.0.1:<port>/mcp`へループバック呼び出しする方式を採用する。ループバックに閉じるため「認証未実装」のセキュリティ上の懸念（Lambda外部からの到達性）は生じない。内部モジュールのdeep importは保守性・将来の破壊的変更リスクの観点から採用しない。
- Lambda実行環境（コンテナ）内でのExpressサーバー起動＋子プロセス管理のコールドスタートへの影響は、次回の技術検証で計測する（`research.md` §8の合格条件を更新: 「単発HTTPリクエストでの疎通」に加え「Lambda相当のコールドスタート含むレイテンシ計測」を追加検証項目とする）。

## 未確認・推測

- 実際のSera API（testnetエンドポイント`api-testnet.sera.cx`）への到達性・レスポンス形状は、有効な`SERA_API_KEY`/`SERA_API_SECRET`を用いた実疎通でのみ確認できる。本スパイクでは実施していない。
- Lambdaコンテナ内で子プロセスとしてExpressサーバーを起動する場合の起動時間・メモリオーバーヘッドは未計測。

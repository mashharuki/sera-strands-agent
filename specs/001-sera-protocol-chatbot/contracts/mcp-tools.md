# MCPツール契約（sera-mcp）とREST API契約の分離

**関連**: [openapi.yaml](./openapi.yaml) | [research.md](./research.md) §1・§6.2 | 憲章 原則VI

本ファイルは、憲章 原則VI「REST APIの契約とMCPのツール定義は区別する」を実装レベルで明文化するためのものである。フロントエンドは**MCPツールを直接呼び出さない**。すべての操作は[openapi.yaml](./openapi.yaml)のREST APIを経由し、MCPツールの呼び出しは`apps/backend/src/agent/`内でのみ発生する（サーバー側専用の契約）。

## sera-mcp（v1, `github.com/sera-cx/sera-mcp`）依存ツール一覧

実コード確認済み（[research.md](./research.md) §1.3参照、commit `d6f50c1a`時点）。ツールの正式なスキーマは`sera-mcp`リポジトリ自体を正本とし、本表はREST APIエンドポイントとの対応関係のみを記録する。

| sera-mcpツール | 呼び出し元REST API | 備考 |
|---|---|---|
| `get_balances`（`src/tools/treasury.ts`） | `GET /wallet/balance` | サーバー単位API資格情報でゲート。ユーザー単位の権限分離はバックエンド側（Wallet所有権検証）で行う |
| `infer_book` / `probe_depth`（`src/tools/depth.ts`） | `GET /market/orderbook` | 合成データ。`OrderbookView.isSynthetic=true`として必ずラベル付けする |
| `get_quote` / `prepare_swap`（`src/tools/core.ts`） | `GET /market/quote`, `POST /transactions/swap/prepare` | UUID＋EIP-712 `route_params`＋有効期限を返す。`Quote.quoteId`として保存 |
| `settlement_status`（`src/tools/settlement.ts`） | `GET /market/history`, `GET /transactions/{id}`, `GET /transactions` | レスポンス形式が正規化されていないため、バックエンド側で`TradeHistoryItem`/`Transaction`スキーマへ変換するアダプター層が必要（[research.md](./research.md) §1.3） |
| `execute_swap`（`src/tools/core.ts`） | `POST /transactions/swap/confirm` | `{uuid, signature}`を受け取る非カストディアル設計。`signature`はPrivyのクライアント側署名をそのまま渡す |
| `buildTransfer` / `sendTransfer`（`src/tools/account.ts`） | `POST /transactions/transfer/prepare`（build）, `POST /transactions/transfer/confirm`（send） | `buildTransfer`は未署名EIP-1559トランザクションを生成し、クライアント署名後に`sendTransfer`でブロードキャストする2段階フロー |

## 未提供のためアプリ側で完全に代替するもの

- **ウォレット作成**: `sera-mcp`に該当ツールなし。Privyのembedded wallet発行APIで完結し、`POST /wallet`はPrivy側の結果をDynamoDBへ記録するのみ（[research.md](./research.md) §5.1）。

## チャットエージェント（`POST /chat`）とMCPツールの関係

`apps/backend/src/agent/`内のStrands Agentは、ユーザーの自然言語メッセージに応じて上記MCPツールを内部的に呼び出す。ただし資産変更系（swap/送金）については、エージェントが直接`execute_swap`/`sendTransfer`相当を実行することはなく、必ず「confirmエンドポイント相当の処理」を経由し、ユーザーの明示的な承認（チャット承認＋ウォレット署名）を待ってから実行する（spec.md FR-009、憲章 原則III・IV）。`ChatStreamEvent`の`approval_required`イベントは、この待機状態をフロントエンドへ伝えるための契約である。

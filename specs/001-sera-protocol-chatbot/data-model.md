# データモデル: Sera Protocol AIチャットボット

**関連**: [spec.md](./spec.md) Key Entities | [research.md](./research.md) §4.4（DynamoDB採用決定）

ストレージはAmazon DynamoDB（オンデマンド、単一テーブル設計候補）。各エンティティのキー設計は実装フェーズ（`/speckit-tasks`）でPK/SK具体案を確定するが、本書では論理データモデルと状態遷移、spec.mdの要件から導かれる検証ルールを定義する。

## エンティティ一覧

### User（ユーザー/アカウント）

spec.md Key Entities「ユーザー/アカウント」に対応。

| フィールド | 型 | 説明 |
|---|---|---|
| userId | string | Privyが発行するユーザーID（PK候補） |
| authIdentifier | string | メール等、Privy側の識別子（表示・監査用途） |
| createdAt | string (ISO8601) | 作成日時 |

**検証ルール**:
- `userId`は一意。認証ミドルウェアがPrivy JWTを検証し、`userId`をリクエストコンテキストへ注入する（[research.md](./research.md) §4.5）。

### Wallet（ウォレット）

spec.md Key Entities「ウォレット」に対応。`/speckit-clarify`の決定により**1ユーザー1ウォレット**。

| フィールド | 型 | 説明 |
|---|---|---|
| userId | string | 所有ユーザーID（PK、Userと1:1） |
| address | string | チェーン上のアドレス（Privy embedded walletが発行） |
| chainId | number | 対象チェーンID（Ethereum Sepolia。実際の値はS1技術検証で確定） |
| createdAt | string (ISO8601) | 作成日時 |

**検証ルール**:
- FR-002: `userId`に対して既にWalletが存在する場合、新規作成せず既存レコードを返す（DynamoDBの条件付きPut `attribute_not_exists(userId)`で実装）。
- FR-004/FR-018: 残高確認・swap・送金のいずれも、リクエストの`userId`（認証コンテキスト由来）とWalletの`userId`が一致する場合のみ許可する。

### Market Info（市場/取引情報: 板・見積もり・取引履歴）

spec.md Key Entities「市場/取引情報（板・見積もり・取引履歴）」に対応。**永続化しない**（都度sera-mcpへ問い合わせるライブデータ）。ただしQuoteのみ、実行時の失効チェックのために一時保存する（下記）。

- **板情報（orderbook, 参考値）**: `sera-mcp`の`infer_book`/`probe_depth`が返す合成ラダー。実データの板情報ではないことをAPIレスポンスに`isSynthetic: true`等で明示する（[research.md](./research.md) §1.3）。
- **価格見積もり**: 下記Quoteエンティティとして一時保存。
- **取引履歴**: `sera-mcp`の`settlement_status`系レスポンスを正規化してその場で返す（永続キャッシュは初期実装では行わない）。

### Quote（見積もり）

| フィールド | 型 | 説明 |
|---|---|---|
| quoteId | string | `sera-mcp`の`get_quote`が返すUUID（PK） |
| userId | string | 発行対象ユーザー |
| fromToken / toToken | string | 対象トークン |
| amount | string (decimal) | 数量 |
| estimatedRate | string | 見積もりレート |
| estimatedFee | string | 想定手数料 |
| slippage | string | スリッページ許容値 |
| expiresAt | number (epoch, DynamoDB TTL属性) | 有効期限 |
| status | enum: `issued` \| `consumed` \| `expired` | 状態 |

**検証ルール**:
- FR-011: `expiresAt`を過ぎたQuoteは`prepare`/`confirm`で再利用不可。TTLでの自動削除に加え、参照時に明示チェックする。
- 1つのQuoteは1回のswap実行にのみ使用可（`status: consumed`後は再利用不可、sera-mcp側も「UUID消費型」であることに整合、[research.md](./research.md) §1.3）。

### ApprovalRequest（取引確認内容/承認リクエスト）

spec.md Key Entities「取引確認内容（承認リクエスト）」に対応。**クライアントが生成する冪等性キー（approvalId）がPK**であり、FR-012（二重実行防止）の実装基盤を兼ねる。

| フィールド | 型 | 説明 |
|---|---|---|
| approvalId | string (UUID, クライアント生成) | PK。冪等性キーを兼ねる |
| userId | string | 対象ユーザー |
| type | enum: `swap` \| `transfer` | 操作種別 |
| network | string | 対象ネットワーク |
| token / toToken | string | 対象トークン（transferは1つ、swapは2つ） |
| amount | string (decimal) | 数量 |
| destinationAddress | string \| null | 送金先（transferのみ） |
| estimatedFee | string | 手数料見積もり |
| slippage | string \| null | スリッページ（swapのみ） |
| quoteId | string \| null | 紐づくQuote（swapのみ） |
| status | enum: `pending_confirmation` \| `chat_approved` \| `signed` \| `executing` \| `executed` \| `cancelled` \| `expired` | 状態（下記状態遷移参照） |
| approvedContentSnapshot | object | ユーザーに提示した内容のスナップショット（FR-010: 実行内容との完全一致を保証するため、実行時はこのスナップショットのみを参照する） |
| createdAt / updatedAt | string (ISO8601) | 日時 |

**検証ルール**:
- FR-006/FR-008: 必要情報が揃うまで`ApprovalRequest`は作成しない（チャット側で不足情報を質問済みであること）。
- FR-009/FR-010: `status`が`signed`になって初めて実行（`executing`）に進める。実行内容は`approvedContentSnapshot`と完全一致させる。
- FR-012: 同一`approvalId`での`confirm`呼び出しは、DynamoDBの条件付き書き込み（`attribute_not_exists`または状態遷移チェック）により1度しか`executing`へ遷移しない。二重リクエストは既存の状態を返す。

**状態遷移**:

```text
pending_confirmation --(チャットで承認)--> chat_approved
chat_approved --(ウォレット署名取得)--> signed
signed --(実行API呼び出し、冪等)--> executing --(broadcast成功)--> executed
pending_confirmation | chat_approved --(ユーザーがキャンセル / 見積もり失効)--> cancelled | expired
```

### Transaction（トランザクション）

spec.md Key Entities「トランザクション」に対応。

| フィールド | 型 | 説明 |
|---|---|---|
| transactionId | string | PK（`sera-mcp`が返す`trade_id`等、またはtxHash） |
| approvalId | string | 紐づくApprovalRequest |
| userId | string | 対象ユーザー |
| type | enum: `swap` \| `transfer` | 操作種別 |
| txHash | string \| null | ブロードキャスト後のトランザクションハッシュ |
| chainState | enum: `broadcast_pending` \| `confirmed_success` \| `confirmed_failed` \| `unknown` | チェーン状態（FR-013/FR-014の根拠データ） |
| broadcastAt | string (ISO8601) | ブロードキャスト日時 |
| confirmedAt | string \| null | 確定日時 |
| lastCheckedAt | string | 最終状態確認日時（US6のポーリング/再照会に使用） |

**検証ルール**:
- FR-013: `chainState`は`settlement_status`等sera-mcpからの照会結果のみで更新する。LLM生成文からの直接更新は行わない。
- FR-014: ブロードキャスト直後は`broadcast_pending`とし、`confirmed_success`/`confirmed_failed`と明確に区別してAPIレスポンスに含める。
- FR-015: `userId`でのクエリにより、実行直後に限らず後から一覧・詳細を照会できる。

### ConversationMessage（会話履歴）

| フィールド | 型 | 説明 |
|---|---|---|
| sessionId | string | 会話セッションID（PK） |
| messageId | string (ULID等、時系列ソート可能) | SK |
| userId | string | 対象ユーザー |
| role | enum: `user` \| `assistant` \| `tool` | 発話者 |
| content | string \| object | メッセージ内容（tool呼び出し結果を含む場合は構造化） |
| createdAt | string (ISO8601) | 日時 |

**検証ルール**:
- FR-018: `sessionId`・`userId`はリクエストごとの認証コンテキストから決定し、他ユーザーのセッションと混在しない。

## エンティティ関連図（概念）

```text
User (1) --- (1) Wallet
User (1) --- (N) ConversationMessage
User (1) --- (N) ApprovalRequest --- (0..1) Quote
ApprovalRequest (1) --- (0..1) Transaction
```

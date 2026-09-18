---

description: "Task list template for feature implementation"
---

# Tasks: Sera Protocol AIチャットボット

**Input**: Design documents from `/specs/001-sera-protocol-chatbot/`

**Prerequisites**: [plan.md](./plan.md)（必須）, [spec.md](./spec.md)（必須）, [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: `.claude/rules/testing.md`（プロジェクト規約）が単体/統合テストの方針を定めているため、安全性・冪等性・所有権検証など憲章上重要な箇所には軽量なテストタスクを含める。網羅的なテストスイートの生成は本タスク分解の対象外とする。

**Organization**: タスクはspec.mdのユーザーストーリー（優先度付き）ごとにグループ化し、各ストーリーが独立して実装・テスト・デモ可能であることを目指す。

**Note**: 本ファイルは`/speckit-analyze`によるクロスアーティファクト分析（2026-09-18実施）で検出されたCRITICAL/HIGH/MEDIUM issue（G1, G3, G2, U1, G4）を反映済み。対応する`data-model.md`側の修正（I1: `ApprovalRequest.expiresAt`追加）も適用済み。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並列実行可能（別ファイル、未完了タスクへの依存なし）
- **[Story]**: 対応するユーザーストーリー（US1〜US6）
- 各タスクに具体的なファイルパスを含める

## Path Conventions

`plan.md` Project Structureに準拠（Web application: `apps/backend`, `apps/frontend`, `apps/cdk`, `packages/shared`, `packages/api-spec`）。技術検証（スパイク）は `specs/001-sera-protocol-chatbot/spikes/` に配置し、プロダクトコードと区別する。

---

## Phase 1: Setup

**Purpose**: モノレポの新規ディレクトリ・依存関係の準備、および実装着手前に解消すべき技術的不確実性（research.md §8のスパイクS1〜S7）の検証。

- [X] T001 `plan.md` Project Structureに従い、`apps/backend/src/{agent,agent/tools,store,routes,auth}`、`apps/frontend/src/features/{chat,wallet,market,transactions}`、`docs/{architecture,blog}`、`specs/001-sera-protocol-chatbot/spikes/`のディレクトリを作成する
- [X] T002 [P] `apps/backend/package.json`に`@strands-agents/sdk`、DynamoDB SDK（`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`）、sera-mcp接続に必要な依存（MCPクライアント、`viem`等）を追加する
- [X] T003 [P] `apps/frontend/package.json`に`@privy-io/react-auth`、`@tanstack/react-query`、`zustand`を追加する
- [X] T004 [P] `apps/cdk/package.json`にDynamoDB/Lambda Function URL関連のCDK L2コンストラクト依存を確認・追加する
- [X] T005 [P] スパイクS1: AWS LambdaのNode.js 22.xランタイム提供状況を公式ドキュメントで確認し、結果を`specs/001-sera-protocol-chatbot/spikes/s1-lambda-node22/findings.md`に記録する（合格条件: research.md §8 S1）
- [ ] T006 [P] スパイクS2: `specs/001-sera-protocol-chatbot/spikes/s2-stream/`にLambda Function URLsレスポンスストリーミングの最小ハンドラーを実装し、ブラウザからトークン単位の逐次受信ができることを確認する（合格条件: research.md §8 S2）
- [ ] T007 [P] スパイクS3: `specs/001-sera-protocol-chatbot/spikes/s3-sera-mcp-http/`で`sera-mcp`(v1)を`--transport http --stateless`で起動し、`get_quote`等を単発HTTPリクエストで呼び出せることを確認する（合格条件: research.md §8 S3）
- [ ] T008 [P] スパイクS4: `specs/001-sera-protocol-chatbot/spikes/s4-strands-bedrock/`で`@strands-agents/sdk`から`jp.anthropic.claude-sonnet-4-6`等のBedrock推論プロファイルを指定した最小Agentを実行し、ダミーツール呼び出しが機能することを確認する（合格条件: research.md §8 S4）
- [ ] T009 [P] スパイクS5: `specs/001-sera-protocol-chatbot/spikes/s5-privy-signature/`でPrivy embedded walletのクライアント側署名が、sera-mcpの`execute_swap`/`sendTransfer`が期待する署名形式と適合するかSepoliaテストネット上で確認する（ブロードキャストは行わない。合格条件: research.md §8 S5）
- [X] T010 [P] スパイクS6: `sera-mcp`(v1)のソースコードを直接確認し、dry-run/テストモードの有無を`specs/001-sera-protocol-chatbot/spikes/s6-dry-run/findings.md`に記録する（合格条件: research.md §8 S6）
- [X] T011 [P] スパイクS7: `specs/001-sera-protocol-chatbot/spikes/s7-openapi-gen/`でOpenAPI Generatorによる生成クライアントとHono側の型定義の整合性確認フローを試作する（合格条件: research.md §8 S7）

**チェックポイント**: T005〜T011の結果、Technical Context（plan.md）の前提（Node.js 22.x、Lambda Function URLsストリーミング、sera-mcpのLambda内蔵実行、Strands+Bedrock疎通、Privy署名互換性）に致命的な問題がないことを確認してからPhase 2へ進む。問題が見つかった場合は`/speckit-plan`を再実行し、plan.md/research.mdを更新する。

---

## Phase 2: Foundational（全ユーザーストーリーの前提条件）

**Purpose**: どのユーザーストーリーの実装にも必要な共通インフラ。**⚠️ このフェーズが完了するまで、いかなるユーザーストーリーの実装にも着手できない**。

- [X] T012 `apps/cdk/lib/data-stack.ts`に`data-model.md`のエンティティ（User/Wallet/Quote/ApprovalRequest/Transaction/ConversationMessage）を格納するDynamoDBテーブル（オンデマンド課金、Quote/ApprovalRequestのTTL属性を含む）を定義する
- [X] T013 `apps/cdk/lib/backend-stack.ts`にHono Lambda（`apps/backend`）+ Amazon API Gateway HTTP APIのコンストラクトを定義する（`research.md` §4.1: チャット以外のエンドポイント用）
- [X] T014 [P] `apps/cdk/lib/backend-stack.ts`に`/chat`用のLambda Function URL（`RESPONSE_STREAM`呼び出しモード）を定義する（`research.md` §4.1）
- [X] T015 [P] `apps/cdk/lib/frontend-stack.ts`にS3 + CloudFrontのフロントエンド配信コンストラクトを定義する
- [X] T016 `apps/backend/src/auth/privy.ts`にPrivy発行JWTを検証し、`userId`をリクエストコンテキストへ注入するHonoミドルウェアを実装する
- [X] T017 [P] `apps/backend/src/store/client.ts`にDynamoDB DocumentClientの共通初期化モジュールを実装する
- [X] T018 [P] `apps/backend/src/agent/sera-mcp-client.ts`に`sera-mcp`(v1)へのMCPクライアント（Streamable HTTP statelessモード、`external`署名モード前提）を実装する（`contracts/mcp-tools.md`準拠）
- [X] T019 `apps/backend/src/agent/errors.ts`に、sera-mcp呼び出し失敗（タイムアウト・エラーレスポンス・接続不可）を検出し、成功したかのように誤って扱わない共通エラー変換ヘルパーを実装する（FR-017）。`market.ts`・`transactions.ts`・エージェントツール群はこのヘルパーを経由してエラーをチャットへ伝える。T018完了後に着手
- [X] T020 [P] `apps/backend/src/agent/strands-client.ts`にStrands Agentのブートストラップ（Bedrock `BedrockModel`、モデルID設定を環境変数化）を実装する
- [X] T021 `apps/backend/src/store/idempotency.ts`にDynamoDB条件付き書き込みベースの冪等性ヘルパー（`attribute_not_exists`）を実装する（FR-012の共通基盤）
- [X] T022 `apps/backend/src/store/conversations.ts`に`ConversationMessage`エンティティのCRUDを実装する（`data-model.md`準拠）
- [X] T023 `apps/backend/src/routes/chat.ts`に`POST /chat`のストリーミング応答スケルトン（Strands Agent呼び出し、`ChatStreamEvent`のtoken/doneイベント送出のみ、ツール固有ロジックは各ストーリーで追加）を実装する
- [X] T024 `contracts/openapi.yaml`の内容を`packages/api-spec/openapi.yaml`へ配置し、`openapi-typescript`で型定義を生成するnpmスクリプトを`packages/api-spec/package.json`に追加する（スパイクS7の決定により、Java依存の`openapi-generator-cli`ではなくZero-Javaの`openapi-typescript`+`openapi-fetch`を採用。`research.md` §6.2参照）
- [X] T025 [P] `packages/shared/src/index.ts`にAPIモデル（`Wallet`, `Quote`, `ApprovalRequest`, `Transaction`等）の共有型エクスポートを追加する
- [X] T026 `apps/frontend/src/main.tsx`（または相当のエントリポイント）にPrivy Providerと認証ガード（未ログイン時のリダイレクト、FR-019対応）を設定する
- [X] T027 [P] `apps/frontend/src/services/apiClient.ts`にTanStack Query + 生成クライアントのラッパーを実装する
- [X] T028 [P] `apps/frontend/src/store/session.ts`にzustandによるセッション/ウォレット状態ストアを実装する
- [X] T029 [P] `apps/frontend/src/features/chat/ChatShell.tsx`にメッセージ一覧・入力欄・ストリーミング逐次表示を行う基本チャットUIシェルを実装する

**チェックポイント**: Phase 2完了時点で、認証済みユーザーがログインし、空のチャット画面が表示され、`POST /chat`にメッセージを送るとストリーミングでダミー応答が返る状態になっている。以降、Phase 3以降は各ユーザーストーリーごとに独立して着手できる。

---

## Phase 3: User Story 1 - チャットからウォレットを作成する (Priority: P1) 🎯 MVP

**Story Goal**: `spec.md` US1。ユーザーがチャットの自然言語依頼のみでウォレットを作成できる。

**Independent Test**: ウォレット未作成のアカウントでログインし、チャットに「ウォレットを作成して」と入力し、完了後にウォレットアドレスが提示される一連の流れを単独で確認できる（`quickstart.md` シナリオ1）。

- [X] T030 [P] [US1] `apps/backend/src/store/wallets.ts`に`Wallet`エンティティのCRUDを実装する。`userId`への条件付きPut（`attribute_not_exists`）でFR-002（重複作成防止）を担保する
- [X] T031 [US1] `apps/backend/src/routes/wallet.ts`に`POST /wallet`・`GET /wallet`ルートを実装する（`contracts/openapi.yaml`準拠。未ログイン時は認証を促す、FR-019）
- [X] T032 [US1] `apps/frontend/src/features/wallet/createWallet.ts`にPrivy embedded walletのクライアント側作成フローを実装する
- [X] T033 [US1] `apps/backend/src/agent/tools/wallet.ts`にウォレット作成の自然言語意図を検出し`POST /wallet`相当の処理へ橋渡しするエージェントツールを実装する
- [X] T034 [US1] `apps/frontend/src/features/wallet/WalletCreationFlow.tsx`にチャット上でのウォレット作成フロー（作成完了後にアドレスを表示、既存ウォレットがある場合の案内）のUIを実装する
- [X] T035 [P] [US1] `apps/backend/test/store/wallets.test.ts`に、同一`userId`への重複作成が新規作成を発生させないことを検証するvitestを実装する（FR-002）
- [X] T036 [P] [US1] `apps/backend/test/routes/wallet.test.ts`に、未認証リクエストが拒否されること（FR-019）を検証するvitestを実装する

**チェックポイント**: US1が独立して完全に動作し、デモ可能。

---

## Phase 4: User Story 2 - チャットで自分のウォレット残高を確認する (Priority: P1)

**Story Goal**: `spec.md` US2。読み取り専用の残高確認。

**Independent Test**: ウォレットと残高を保有するアカウントでログインし、チャットで残高確認を依頼して結果が表示されることを単独で確認できる（`quickstart.md` シナリオ2）。

- [ ] T037 [US2] `apps/backend/src/agent/tools/balance.ts`に`sera-mcp`の`get_balances`を呼び出す残高取得ツールを実装する
- [ ] T038 [US2] `apps/backend/src/routes/wallet.ts`に`GET /wallet/balance`ルートを追加する
- [ ] T039 [US2] `apps/backend/src/routes/wallet.ts`の残高確認処理に所有権検証（リクエストの`userId`とWalletの`userId`一致、FR-004）を追加する
- [ ] T040 [P] [US2] `apps/frontend/src/features/wallet/BalanceView.tsx`に残高表示コンポーネントを実装する
- [ ] T041 [P] [US2] `apps/backend/test/routes/wallet.test.ts`に、ウォレット未作成時は作成を提案する応答になること（FR-003補完）、他人のウォレットを指定した場合に拒否されること（FR-004）を検証するvitestを追加する

**チェックポイント**: US1・US2が組み合わさり、ウォレット作成〜残高確認までの一連の読み取り体験がデモ可能。

---

## Phase 5: User Story 3 - チャットでSera Protocolの板・取引情報を調べる (Priority: P2)

**Story Goal**: `spec.md` US3。板情報（参考値）・価格見積もり・取引履歴を互いに混同せず取得する。

**Independent Test**: ログイン済みユーザーが価格・板・履歴のいずれかを尋ね、意図した種類の情報が他の種類と混同されずに返ることを単独で確認できる（`quickstart.md` シナリオ3）。

- [ ] T042 [P] [US3] `apps/backend/src/store/quotes.ts`に`Quote`エンティティのCRUD（TTL付き）を実装する
- [ ] T043 [US3] `apps/backend/src/agent/tools/quote.ts`と`apps/backend/src/routes/market.ts`の`GET /market/quote`に、`sera-mcp`の`get_quote`呼び出しと`Quote`永続化を実装する
- [ ] T044 [US3] `apps/backend/src/agent/tools/orderbook.ts`と`GET /market/orderbook`に、`infer_book`/`probe_depth`呼び出しと`isSynthetic: true`ラベル付けを実装する（`research.md` §1.3、実データではないことの明示）
- [ ] T045 [US3] `apps/backend/src/agent/tools/history.ts`と`GET /market/history`に、`settlement_status`レスポンスを`TradeHistoryItem`へ正規化するアダプターを実装する
- [ ] T046 [US3] `apps/backend/src/agent/tools/market-router.ts`に、ユーザー発話を板/見積もり/履歴の3種に分類しFR-005（混同禁止）を担保するルーティングロジックを実装する
- [ ] T047 [P] [US3] `apps/frontend/src/features/market/`に板・見積もり・履歴それぞれの表示コンポーネントを実装する
- [ ] T048 [P] [US3] `apps/backend/test/agent/market-router.test.ts`に、3種のクエリが正しく分類されることを検証するvitestを実装する

**チェックポイント**: US1〜US3が組み合わさり、読み取り系機能一式（ウォレット作成・残高・市場情報）がデモ可能。

---

## Phase 6: User Story 4 - チャットでステーブルコインをswapする (Priority: P2)

**Story Goal**: `spec.md` US4。確認・承認（チャット承認＋ウォレット署名）を経たswap実行。

**Independent Test**: ウォレットと残高を保有するユーザーがswapを依頼し、確認画面表示→承認→署名→実行完了までを単独で確認できる（`quickstart.md` シナリオ4）。

- [ ] T049 [P] [US4] `apps/backend/src/store/approvals.ts`に`ApprovalRequest`エンティティ（`approvedContentSnapshot`・`expiresAt`、状態遷移: pending_confirmation→chat_approved→signed→executing→executed/cancelled/expired）を実装する
- [ ] T050 [US4] `apps/backend/src/routes/transactions.ts`に`POST /transactions/swap/prepare`を実装する（必要情報不足時は400、FR-006/FR-008）
- [ ] T051 [US4] `apps/backend/src/routes/transactions.ts`に`POST /transactions/swap/confirm`を実装し、`apps/backend/src/store/idempotency.ts`を用いて同一`approvalId`の二重実行を防止する（FR-012）
- [ ] T052 [US4] `apps/backend/src/store/transactions.ts`に`Transaction`エンティティのCRUD（初期状態`broadcast_pending`での書き込み）を実装する
- [ ] T053 [US4] `POST /transactions/swap/confirm`にQuote有効期限の再チェック（失効時は409、FR-011）を追加する
- [ ] T054 [US4] `apps/backend/src/routes/transactions.ts`のswap confirm処理に、対象トークンの残高不足・ネットワーク手数料(ガス代)不足・署名拒否によりswapを実行できない場合のエラーハンドリングを追加し、理由とガス代不足時のfaucet入手方法案内をチャットへ返す（FR-016, FR-020, spec.md US4 AC6）
- [ ] T055 [US4] `apps/frontend/src/features/transactions/SwapConfirm.tsx`にネットワーク・トークン・数量・手数料・スリッページを表示する確認画面を実装する
- [ ] T056 [US4] `apps/frontend/src/features/transactions/signAndConfirm.ts`にPrivyクライアント側署名から`confirm`呼び出しまでの一連のフローを実装する
- [ ] T057 [US4] `apps/backend/src/agent/tools/swap.ts`に、チャットでのswap意図検出を実装する。対象トークン・数量等が不足している場合はチャットで質問して補完し（FR-006）、揃った時点で`prepare`を呼び出し`approval_required`ストリームイベントを送出する
- [ ] T058 [P] [US4] `apps/backend/test/routes/transactions.swap.test.ts`に、同一`approvalId`での複数回confirm呼び出しが1度しか実行されないことを検証するvitestを実装する（FR-012, SC-005）
- [ ] T059 [P] [US4] `apps/backend/test/routes/transactions.swap.test.ts`に、失効したQuoteでのconfirmが拒否されることを検証するvitestを追加する（FR-011）

**チェックポイント**: US1〜US4が組み合わさり、資産変更系操作（swap）を含む中核フローがデモ可能。

---

## Phase 7: User Story 5 - チャットで送金する (Priority: P2)

**Story Goal**: `spec.md` US5。確認・承認を経た送金実行。

**Independent Test**: ウォレットと残高を保有するユーザーが送金を依頼し、確認画面表示→承認→署名→実行完了までを単独で確認できる（`quickstart.md` シナリオ5）。

- [ ] T060 [US5] `apps/backend/src/routes/transactions.ts`に`POST /transactions/transfer/prepare`を実装する（送金先アドレス必須、FR-006/FR-008）
- [ ] T061 [US5] `apps/backend/src/routes/transactions.ts`に`POST /transactions/transfer/confirm`を実装し、`buildTransfer`（未署名tx生成）→クライアント署名→`sendTransfer`（ブロードキャスト）の2段階フローを冪等に扱う（FR-012）
- [ ] T062 [US5] `apps/backend/src/routes/transactions.ts`の`POST /transactions/transfer/confirm`に、`ApprovalRequest.expiresAt`に基づく確認内容の失効チェックを追加し、失効時は409を返しユーザーに再確認を求める（FR-011）
- [ ] T063 [US5] `apps/frontend/src/features/transactions/TransferConfirm.tsx`に送金確認画面（宛先・数量・手数料表示）を実装する
- [ ] T064 [US5] `apps/backend/src/agent/tools/transfer.ts`に、チャットでの送金意図検出を実装する。送金先・数量等が不足している場合はチャットで質問して補完し（FR-006）、揃った時点で`prepare`を呼び出す
- [ ] T065 [US5] `apps/backend/src/routes/transactions.ts`に残高不足・ガス代不足（faucet案内、FR-020）・署名拒否の各エラーをチャットに明確に伝えるハンドリングを実装する（FR-016）
- [ ] T066 [P] [US5] `apps/backend/test/routes/transactions.transfer.test.ts`に、二重クリック相当の重複confirmリクエストが二重送金を発生させないことを検証するvitestを実装する（FR-012, SC-005）

**チェックポイント**: US1〜US5が組み合わさり、spec.mdが要求する全操作（読み取り＋swap＋送金）がデモ可能。

---

## Phase 8: User Story 6 - 実行結果とトランザクション状態を確認する (Priority: P3)

**Story Goal**: `spec.md` US6。オンチェーン状態に基づく実行結果の後追い確認。

**Independent Test**: 実行済み（または実行中）のswap・送金が存在する状態で、チャットにその結果を尋ね、オンチェーン状態を反映した回答が返ることを単独で確認できる（`quickstart.md` シナリオ6）。

- [ ] T067 [US6] `apps/backend/src/routes/transactions.ts`に`GET /transactions/{transactionId}`・`GET /transactions`を実装し、`settlement_status`によるチェーン状態照会を反映する
- [ ] T068 [US6] `apps/backend/src/agent/tools/transaction-status.ts`に、チャットでの状態確認依頼に対し、DynamoDBの`Transaction.chainState`（検証済みの値のみ）を根拠に応答するツールを実装する（FR-013、LLM文章のみでの判定禁止）
- [ ] T069 [P] [US6] `apps/frontend/src/features/transactions/TransactionHistory.tsx`に取引履歴・状態一覧表示を実装する
- [ ] T070 [P] [US6] `apps/backend/test/agent/transaction-status.test.ts`に、`chainState`が`sera-mcp`からの検証済みレスポンスのみで更新され、自由文からは更新されないことを検証するvitestを実装する

**チェックポイント**: spec.mdの全6ユーザーストーリーが完全に動作する。

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 全ストーリー横断の品質ゲート、ドキュメント、デプロイ/削除フロー（`docs/memo.md` §10）。

- [ ] T071 [P] `packages/api-spec/postman/`に`contracts/openapi.yaml`の全エンドポイントを網羅するPostmanコレクションと、Newman実行用npmスクリプトを追加する
- [ ] T072 [P] CIに、OpenAPI Generatorの生成コマンドを実行し差分がないことを確認するステップ（生成コード整合性確認、憲章 原則VI）を追加する
- [ ] T073 [P] `apps/frontend/e2e/chat-flow.spec.ts`にUS1〜US6のハッピーパスを通しで確認するPlaywright E2Eテストを実装する
- [ ] T074 [P] `apps/cdk/test/`に新規スタック（data-stack, backend-stack, frontend-stack）のCDKスナップショット/ユニットテストを追加する
- [ ] T075 ルートの`package.json`に`pnpm deploy -- --stage <stage>` / `pnpm destroy -- --stage <stage>`を実装する（コード生成→ビルド→CDKデプロイ→フロントエンド配信設定を一貫して行い、完了時にアプリURLを表示。`research.md`の決定に基づく）
- [ ] T076 `README.md`を`docs/memo.md` §9の構成（目的・サンプル会話・アーキテクチャ・処理フロー・ディレクトリ構成・前提条件・ローカル開発・環境変数・API仕様・テスト方法・デプロイ/削除手順・トラブルシューティング・料金概算・制約・参照元）で更新する
- [ ] T077 [P] `docs/architecture/`にdraw.io編集可能な`.drawio`形式のアーキテクチャ図と、README埋め込み用のSVG/PNGを作成する
- [ ] T078 `docs/blog/`に技術ブログ原稿のドラフトを作成する（実装完了後、実測した実行結果・スクリーンショット・計測値のみを反映する。憲章 原則VII）
- [ ] T079 `pnpm check`・`pnpm --filter backend build`・`pnpm --filter frontend build`・`pnpm --filter cdk build`・`pnpm --filter cdk test`を全て実行し、lint・型チェック・ビルドが通ることを確認する
- [ ] T080 [P] `apps/frontend/e2e/chat-flow.spec.ts`（またはCI集計スクリプト）に、SC-001（ウォレット作成〜残高確認が5分以内）の実行時間アサーションと、SC-002（板/見積/履歴照会の80%が追加確認なしで一回のやり取りで回答される）を検証するテストケース集計を追加する

---

## Dependencies & Execution Order

### フェーズ間の依存関係

- **Phase 1 (Setup)**: 依存なし。スパイク（T005〜T011）は互いに独立して並列実行可能
- **Phase 2 (Foundational)**: Phase 1完了後に着手（特にT005/T006/T007/T008/T009の検証結果に基づきT013/T014/T018/T020の実装方針を確定する）。T019はT018完了後に着手（sera-mcp-clientのエラー形状に依存）。**全ユーザーストーリーをブロックする**
- **Phase 3 (US1)**: Phase 2完了後に着手可能。他のユーザーストーリーへの依存なし
- **Phase 4 (US2)**: Phase 2完了後に着手可能。US1のWalletエンティティ（T030）を参照するため、実装順としてはUS1の後が自然だが、モックWalletデータがあれば独立着手も可能
- **Phase 5 (US3)**: Phase 2完了後に着手可能。他ストーリーへの実装依存なし（Wallet不要、読み取り専用）
- **Phase 6 (US4)**: Phase 2完了後に着手可能。US3のQuoteエンティティ（T042）を参照する
- **Phase 7 (US5)**: Phase 2完了後に着手可能。US4のApprovalRequest/Transactionエンティティ（T049, T052）を再利用する
- **Phase 8 (US6)**: Phase 2完了後に着手可能。US4・US5が生成するTransactionレコードが存在しないと実地検証できないため、実装順としてはUS4・US5の後が自然
- **Phase 9 (Polish)**: 全ユーザーストーリー完了後

### ユーザーストーリー間の推奨実装順序（優先度に基づく）

1. US1（P1）→ 2. US2（P1）→ 3. US3（P2）→ 4. US4（P2）→ 5. US5（P2）→ 6. US6（P3）

### 各フェーズ内の並列実行例

```text
# Phase 1（スパイク、すべて並列可）
T005, T006, T007, T008, T009, T010, T011 を同時に着手可能

# Phase 2（Foundational、一部並列可）
T014, T015, T017, T018, T020, T025, T027, T028, T029 は各々別ファイルのため並列可能
（T012→T013→T016→T021→T022→T023→T024 は順序依存あり。T018→T019も依存あり）

# Phase 3（US1）
T030 のstore実装後、T031(ルート)・T033(agentツール) は並列可能。T035, T036（テスト）は対象実装完了後に並列実行可能
```

## Implementation Strategy

### MVPスコープ

**Phase 1 + Phase 2 + Phase 3（US1）** が最小のデモ可能単位（MVP）である。この時点で「チャットからウォレットを作成する」という中核体験が独立してデモできる。

### 段階的デリバリー

1. Setup + Foundational + US1 → MVPとして検証・デモ
2. US2を追加 → 読み取り系の基本体験が完成
3. US3を追加 → 市場情報照会が加わり、意思決定支援が可能に
4. US4を追加 → 資産変更操作（swap）の中核安全フローが動作
5. US5を追加 → spec.mdが要求する全操作が完成
6. US6を追加 → 実行結果の信頼性担保が完成
7. Polish（Phase 9）→ README・ブログ・E2E・デプロイ/削除フローを含めた最終成果物

各段階は、対応するPhaseの「Independent Test」基準および`quickstart.md`の該当シナリオで検証する。

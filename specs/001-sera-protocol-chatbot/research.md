# Phase 0 調査結果: Sera Protocol AIチャットボット

**関連仕様**: [spec.md](./spec.md) | **関連憲章**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md)

本ドキュメントは `docs/memo.md` §4・§5・§6・§7 が要求する事前調査の結果と、そこから導いた設計決定をまとめたものである。各決定には根拠の信頼度（実コード確認 / ドキュメント確認 / 主観 / 推測）を付す。調査はGitHub上の実コード・公式ドキュメントに対して2件のサブエージェント調査（2026-09-18実施）で行った。

---

## 1. Sera関連リポジトリ調査

### 1.1 参照先の正当性確認（実コード確認）

`docs/memo.md` が示した3つの参照候補を確認した結果、**重大な事実が判明した**:

| # | 候補URL | 結果 |
|---|---|---|
| 1 | `github.com/sera-cx/sera-mcp` | 実在（`main` @ commit `d6f50c1a`、閲覧日2026-09-18）。ただし**ステーブルコイン↔法定通貨のFX決済**MCPサーバーであり、汎用の「Ethereum Sepolia DEX」ではない。 |
| 2 | `github.com/sera-cx/sera-agents` | 実在（`main` @ commit `49192ceb`）。`sera-mcp`(v1)の上に構築されたテンプレート/CLI群で、独自のオーケストレーション層ではない。 |
| 3 | `agents.sera.cx/docs/tutorials/ai-agent.html` | 到達確認済み。FXエージェントのチュートリアルで、Strands・ウォレット作成・板情報・送金への言及なし。 |

**未リストだった重大な発見**: `github.com/sera-cx/sera-mcp-v2` という別リポジトリが存在し（`main` @ commit `8834ad34`）、`package.json`の`name`フィールドが**同じく`"sera-mcp"`**（バージョン`1.0.0`）である。v1とv2は同名だが別物であり、以下のように性質が大きく異なる（すべて実コード確認）。

| 観点 | sera-mcp (v1) | sera-mcp-v2 |
|---|---|---|
| 対象 | ステーブルコイン⇄法定通貨のFX決済 | CLOB型トレーディング＋ウォレット残高 |
| 対応チェーン | `SERA_NETWORK=mainnet\|sepolia`（API URL切替のみ、chainId明示なし） | **Ethereum mainnet (chainId 1) / Sepolia (chainId 11155111) を明記** |
| 署名方式 | `external`（既定、サーバーは署名しない）/ `local` / `readonly` の3モード | **`WALLET_PRIVATE_KEY`をサーバー環境変数で保持し常にサーバー側で署名（カストディアル、単一ウォレット固定）** |
| トランスポート | stdio（既定）または `--transport http --stateless`（Lambda向き） | **stdioのみ**（`StdioServerTransport`固定） |
| 板情報 | 実際の板情報なし。`infer_book`/`probe_depth`が見積もりを多点プローブして合成する近似ラダー（コード内コメントで明言） | 板情報なし。`place_limit_order`/`get_open_orders`/`cancel_order`はユーザー自身の注文操作であり、市場全体の板ではない |
| 送金ツール | `buildTransfer()`（未署名EIP-1559トランザクション生成）→ 呼び出し側で署名 → `sendTransfer(raw_tx)` | **送金/転送ツールなし**（`src/index.ts`確認済み） |
| ウォレット作成 | なし | なし |

### 1.2 決定: `sera-mcp` (v1, `sera-cx/sera-mcp`) を採用する

**Decision**: 本プロジェクトの資産操作（swap・送金・見積もり取得）は `sera-cx/sera-mcp`（v1）を通じて実装する。`sera-mcp-v2`は採用しない。

**Rationale**:
- 憲章 原則V および spec.md FR-009/FR-010（`/speckit-clarify`で確定: チャット承認に加えユーザー自身のウォレットでの暗号学的署名を都度必須とする非カストディアル方式）は、**サーバーが秘密鍵を保持して自動署名するv2のモデルとは構造的に両立しない**。v1の`external`署名モード（既定値、サーバーは署名しない）のみがこの要件を満たす。これは好みの問題ではなく、既に確定した安全要件からの論理的帰結である。
- v1は`buildTransfer`/`sendTransfer`という送金ツールを持つが、v2には送金ツールが存在しない。spec.mdのUser Story 5（送金）を満たせるのはv1のみ。
- v1の`--transport http --stateless`モードは、Lambda内でのリクエスト単位実行に適しており、憲章 原則II（フルサーバーレス、常駐プロセス不要）を満たしやすい。v2はstdio固定のため、Lambda内での利用にはツールハンドラーを直接呼び出すラッパーが必要になる。

**Alternatives considered**:
- v2の採用: Ethereum Sepoliaの明記やCLOB型注文操作は魅力的だが、上記の署名モデルの非互換性により却下。
- v1とv2の併用（読み取りはv2、実行はv1等）: 依存関係とメンテナンス対象が倍増し、教材としての分かりやすさ（憲章の目的）を損なうため、初期実装では採用しない。将来的な拡張候補としてのみ記録する。

**未決事項・リスク（未確認・推測）**:
- ~~v1が実際にEthereum Sepolia上で決済しているか~~ → **解消済み**。スパイクS3（[spikes/s3-sera-mcp-http/findings.md](./spikes/s3-sera-mcp-http/findings.md)）で`src/index.ts`の起動時sanity checkを確認し、`SERA_NETWORK=sepolia`がchainId `11155111`（Ethereum Sepolia）に対応することを実コードで確認した。
- v1・v2が同名パッケージである理由（フォーク、後継、無関係な試作等）は不明。Seraチームへの確認を推奨する。
- `sera-agents`のx402デモは"Base Sepolia"（Ethereumとは別チェーンのBase）に言及しており、本プロジェクトが対象とするEthereum Sepoliaと混同しないこと。

### 1.3 機能対応表（実コード確認、v1ベース）

| 機能 | 分類 | 根拠 |
|---|---|---|
| ウォレット作成 | **追加実装が必要** | v1に該当ツールなし。Privyのembedded wallet作成で完全に代替する（§5）。 |
| 残高確認 | **そのまま利用可能**（読み取り） | `src/tools/treasury.ts` `get_balances`。ただしv1は`SERA_API_KEY`/`SERA_API_SECRET`というサーバー単位の運用者資格情報でゲートされており、ユーザーごとの権限分離はアプリ側（後述のFR-004/FR-018対応）で実装する必要がある。 |
| 板情報 | **アダプターが必要（実データではなく合成データ）** | `src/tools/depth.ts` `inferBook()`/`probe_depth`のdocコメント: "Sera doesn't expose an order book... construct a synthetic ladder"。spec.md US3を満たすには、この合成ラダーを「参考値」として明示しラベル付けするアダプター層が必要。 |
| 価格見積もり | **そのまま利用可能** | `get_quote`/`prepare_swap`（`src/tools/core.ts`）。UUID＋EIP-712 `route_params`＋有効期限を返す。spec.md FR-011（見積もり失効時の再確認）に直接対応できる。 |
| 取引履歴 | **アダプターが必要** | `settlement_status`（`src/tools/settlement.ts`）が`/orders`をラップするが、doc内で「レスポンス形式は正規化されていない」と明記。フロントエンド表示用の正規化アダプターが必要。 |
| swap実行 | **そのまま利用可能** | `execute_swap`が`{uuid, signature}`を受け取る非カストディアル設計。Privyのクライアント側署名と直接接続できる。 |
| 送金実行 | **そのまま利用可能** | `buildTransfer`→（クライアント署名）→`sendTransfer`の3ステップ。 |
| 取引状態確認 | **そのまま利用可能** | `settlement_status`が`trade_id`/`uuid`で状態照会。 |

---

## 2. Strands Agents TypeScript SDK

**Decision**: `strands-agents/sdk-typescript`ではなく、`strands-agents/harness-sdk`モノレポ配下の`strands-ts/`が現行実装であり、npmパッケージ`@strands-agents/sdk`（2026-09-18時点最新 `1.18.0`）を採用する。

**Rationale（実コード確認）**:
- `sdk-typescript`はアーカイブ済み（`archived: true`）。README冒頭に「このリポジトリはアーカイブされました。TypeScript SDKは`strands-agents/harness-sdk`モノレポに移動しました」と明記（最終コミット2026-06-02）。
- `harness-sdk`は本日（2026-09-18）まで更新が続いており、リリース履歴はほぼ週次（`typescript/v1.12.0`〜`v1.18.0`、2026-08-07〜09-15）。放棄されたプロジェクトではない。
- npmパッケージ名はアーカイブ前後で同一（`@strands-agents/sdk`）のため、依存関係の記述自体はシンプル。ただしNode.js要件が20+→22+に上がっている点に注意（要検証、§8）。
- 公式ドキュメント（strandsagents.com）にて「`BedrockModel`プロバイダーが既定で使用され、既定モデルはClaude Sonnet 4.6」「Amazon Bedrock対応: Python✅/TypeScript✅」と明記。MCPクライアント統合（`McpClient`+`StdioClientTransport`、およびStreamable HTTP transport相当）も中核機能としてドキュメント化されている。

**Alternatives considered**:
- 代替のTypeScriptエージェントフレームワーク（LangChain.js、素のBedrock Converse API直叩き等）への切り替え: `harness-sdk`が活発にメンテナンスされていることが確認できたため、`docs/memo.md`が明示する技術選定（Strands Agents）から逸脱する必要はないと判断。

**未確認・推測**:
- `strands-ts/README.md`自体（モノレポのサブディレクトリREADME）は未取得。トップレベルREADMEの記述との整合性は高い可能性があるが、実装着手前に直接確認する。
- AWS Lambda上での実績を明示した記述は見つかっていない（「no hosted control plane」「runs in your process」という設計思想から適合性を推測しているのみ）。技術検証タスクとする。

---

## 3. Amazon Bedrock モデル・リージョン選定

**Decision**: モデルは **Claude Sonnet 4.6**、リージョンは **ap-northeast-1 (Tokyo)** を軸に、日本国内クロスリージョン推論プロファイル **`jp.anthropic.claude-sonnet-4-6`**（Tokyo⇄Osaka）を第一候補とし、フォールバックとしてグローバル推論プロファイル `global.anthropic.claude-sonnet-4-6` を用意する。コスト調整はBedrockの **Flexサービスティア**（多段エージェントワークフロー向け割引）を検討する。

**Rationale（ドキュメント確認）**:
- Strands TS SDKの既定モデルと一致するため、SDKのデフォルト設定・ドキュメント・サンプルコードをそのまま活用でき、教材としての分かりやすさに資する。
- Claude Sonnet 4.6のモデルカードで、Bedrock Runtime経由のConverse API・クライアント側tool calling・構造化出力・エージェント機能・ストリーミングをサポートすることを確認。エージェントのマルチステップtool-use（sera-mcpツール呼び出し）に必須の機能が揃っている。
- `jp.anthropic.claude-sonnet-4-6`というジオ推論プロファイルIDがTokyo/Osaka向けに存在することを確認（日本国内完結、低レイテンシ）。東京リージョンでの直接（in-region）呼び出し可否そのものは未確認だが、ジオ/グローバル推論プロファイル経由での到達は確認済みであり、実運用上の代替手段がある。
- Bedrock Flexティアが「モデル評価、要約、多段エージェントワークフロー」向けの割引価格帯と明記されており、`docs/memo.md`が重視する低コストに合致する。

**Alternatives considered**:
- Amazon Nova系（Micro/Lite/Pro）: 大幅に低コストだが、Strands TS SDKのモデルプロバイダー対応表で明確な優先候補として確認できておらず、tool-use品質の実績もClaudeほど文書化されていない。教材の分かりやすさ・動作確実性を優先し、初期実装ではClaude Sonnet 4.6を採用し、コストはFlexティアで調整する方針とする。Nova系への切り替えは将来のコスト最適化課題として記録する。

**未確認・推測**:
- 東京リージョンでのClaude Sonnet 4.6のIn-Region直接呼び出し可否（モデルカードの対応表セルが未確認）。
- Claude Sonnet 4.6の実際のトークン単価（AWS Marketplace経由課金のため、Bedrock Pricingページでの別途確認が必要）。
- Strands TS SDKに`jp.*`のようなリージョン限定推論プロファイルIDをそのまま渡せるか（Bedrock仕様上は可能なはずだが、SDK側の実地検証は未実施）。

---

## 4. フルサーバーレス・アーキテクチャ決定

### 4.1 API Gatewayの種類とチャットの応答方式

**Decision**: チャット/エージェントターンのエンドポイント（`POST /chat`相当）は **Lambda Function URLsのレスポンスストリーミング**（`RESPONSE_STREAM`呼び出しモード、`awslambda.streamifyResponse`）を用いる。それ以外の短時間で完了するエンドポイント（残高照会、見積もり取得、取引確認・実行、状態照会等）は **Amazon API Gateway HTTP API**＋Lambda（バッファ応答）とする。

**Rationale（主観／十分に安定した一般知識に基づく判断。詳細は個別サブエージェント調査を行っていないため「ドキュメント確認」ではなく設計判断として明記する）**:
- API Gateway（REST/HTTP API）の統合タイムアウトは29秒が上限であり、これは長年変わっていない制約である。Bedrock＋MCPツール呼び出しを複数往復しうるエージェントのチャットターンはこの上限を超えるリスクがある（`docs/memo.md`§5が明示的に懸念している点）。
- Lambda Function URLsのレスポンスストリーミングは最大15分の実行時間まで進行状況をストリームでき、API Gatewayの29秒上限を回避できる。チャットUXとしてもトークンを逐次表示できる利点がある。
- 残高照会・見積もり取得・取引確認/実行・状態照会は単発の外部API呼び出し（Sera API、チェーンRPC）で完結し、29秒を超えるリスクが低いため、シンプルなAPI Gatewayでよい。取引の**オンチェーン確定**を待つ処理は同期応答に含めない（§4.4参照）。

**Alternatives considered**:
- 全エンドポイントをAPI Gateway同期応答にする: チャットターンが29秒を超える可能性があり、長い調査・複数ツール呼び出しを伴う板情報/取引履歴照会で失敗するリスクが高いため却下。
- SQS＋非同期ポーリング方式: チャットのような対話的UXには往復レイテンシが大きく、教材としての分かりやすさも損なうため、初期実装では採用しない。
- API Gateway WebSocket API: Lambda Function URLsストリーミングより実装・状態管理（接続ID管理）が複雑になるため、まずはシンプルな方式を優先する。

**技術検証が必要（未確認）**: Lambda Function URLsストリーミングとCloudFront／Strands TS SDKのストリーミング出力形式の組み合わせ実績。§8の技術検証スパイクで確認する。

### 4.2 sera-mcpの実行方式: Lambda内蔵 vs 別サービス

**Decision**: `sera-mcp`(v1)はLambda内蔵方式を採用する。バックエンドLambda（Honoアプリ）の実行環境内で`sera-mcp`を子プロセスとして`--transport http --stateless --host 127.0.0.1`起動し、同一Lambda内からループバック（`http://127.0.0.1:<port>/mcp`）で呼び出す。

**追記（スパイクS3で判明、[spikes/s3-sera-mcp-http/findings.md](./spikes/s3-sera-mcp-http/findings.md)）**: `sera-mcp`のStreamable HTTPトランスポートには**認証機構が意図的に実装されておらず**、ソースコード上も非ループバックホストへのバインドを起動時ガードで拒否する設計になっている（ループバック以外は`allowedHosts`または明示的なリスク許容フラグが必須）。これは「Lambda内蔵・ループバックのみで通信する」という本決定を積極的に後押しする材料であり、逆に将来「別サービスとして切り出す」場合は、sera-mcp自体には認証機構がないため、その前段にリバースプロキシ等の認証レイヤーを別途構築する必要がある（フルサーバーレス・低コストの目的に反するため、この案は採用しない）。`sera-mcp`をライブラリとして直接importする方式（`src/server/create-server.ts`のdeep import）も技術的には可能だが、`package.json`に`exports`フィールドが無く未公開の内部APIに依存することになるため、保守性を優先し採用しない。公開インターフェース（CLI）のまま子プロセス起動する方式を正とする。

**Rationale**: 憲章 原則II（フルサーバーレスの堅持、常時稼働するサーバー/コンテナを持たない）に照らすと、`sera-mcp`を別ECS/Fargateサービスとして常駐させる案は追加の運用コストと複雑さを生み、教材としての低コスト・保守性の目的に反する。v1が明示的に`--stateless`モードをサポートすることが、Lambda内蔵方式を選ぶ決定打である。

**Alternatives considered**: 別サービス分離案（ECS Fargate等の常駐コンテナ）は、コールドスタートの影響を避けられる利点はあるが、フルサーバーレスの原則（憲章 原則II、NON-NEGOTIABLEではないが強い方針）と低コスト目的に反するため不採用。

### 4.3 MCP接続のライフサイクルとコールドスタート

**Decision**: MCPセッションはLambda呼び出しをまたいで永続化しない。1回のチャットターン（1 Lambda invocation）内でMCPクライアント接続を確立し、そのターン内のツール呼び出しに使い、レスポンス返却後は破棄する。

**Rationale（実コード確認に基づく判断）**: `sera-mcp`(v1)のstatelessモードはリクエスト単位で独立しているため、Lambda呼び出しをまたぐ持続セッションを前提にする必要がない。これによりコールドスタート時に「壊れたセッションを引き継ぐ」問題を回避できる。コールドスタート自体のレイテンシ（MCPクライアント初期化、Bedrockモデルの初回応答等）は技術検証で計測する（§8）。

### 4.4 状態保存先

**Decision**: 会話履歴、ユーザー↔ウォレットの対応、見積もり（Quote）、承認リクエスト、トランザクション状態、冪等性キーは **DynamoDB**（オンデマンドキャパシティ、単一テーブル設計を候補とする）に保存する。Lambdaの一時領域・メモリには一切の永続状態を置かない。

**Rationale（主観、一般的なサーバーレスパターンに基づく判断）**: 憲章 原則IIが明示的に要求する制約（Lambdaの一時領域・メモリへの永続状態依存の禁止）を満たす選択肢の中で、DynamoDBはフルサーバーレス・従量課金（低コスト）・条件付き書き込み（冪等性キーの実装に好適、FR-012対応）・TTL（見積もり失効、FR-011対応）を単一サービスで満たせるため最有力。

**Alternatives considered**: Amazon S3（構造化データの読み書き頻度に対してオーバーヘッドが大きく不採用）、Amazon RDS/Aurora Serverless v2（リレーショナルな整合性は魅力だが、本機能のデータ形状はキー・バリュー的でDynamoDBで十分であり、コスト・運用の単純さを優先）。

### 4.5 同時実行時の認証情報・署名情報の分離

**Decision**: 各リクエストはAPI Gateway/Lambda統合を通じて渡される認証済みユーザーID（Privyが発行するJWT等の検証結果）をコンテキストとして扱い、DynamoDBのすべてのアイテムキーにユーザーIDを含める。Lambda実行環境はステートレスであり、グローバル変数・モジュールスコープにユーザー固有の認証情報を保持しない。

**Rationale**: spec.md FR-018（複数ユーザーの認証情報・ウォレット・進行中の取引依頼を混同しない）を満たすための最小構成。Lambdaのステートレス性を前提にする限り、実装上の混在リスクは主にモジュールスコープのキャッシュ誤用によって生じるため、この点を実装ガイドライン（README／コードレビュー観点）に明記する。

---

## 5. ウォレットと取引の設計

### 5.1 Privyの役割分担

**Decision**: Privyは以下の役割に限定して使用する。

| 役割 | 担当 |
|---|---|
| ユーザー認証 | Privyのログインフロー（メール等の標準的な方式、`/speckit-clarify`のAssumptionsに準拠） |
| ウォレット作成 | Privyのembedded wallet発行機能。1ユーザー1ウォレット（`/speckit-clarify`で確定） |
| 署名 | Privyのクライアント側SDKによる、ユーザー操作起点の署名（都度必須、`/speckit-clarify`で確定） |
| 鍵管理 | Privy側（TEE/キー分散方式等、Privy自身の実装に委ねる）。バックエンドは秘密鍵を一切扱わない |

**Rationale**: `docs/memo.md`§6が要求する「ユーザー認証、ウォレット作成、署名、鍵管理を分けて説明」に対応。バックエンドが秘密鍵を扱わない設計は、憲章 原則V（秘密情報の非露出）と`/speckit-clarify`で確定した非カストディアル方式の両方を満たす。

### 5.2 ブラウザ側署名 vs サーバー側署名

**Decision**: ブラウザ側（クライアント）署名を採用する。

**Rationale**: `/speckit-clarify`のQ1回答（チャット承認に加え、実行のたびにユーザー自身のウォレットでの署名を必須とする）は、事実上サーバー側署名を排除する。sera-mcp(v1)の`execute_swap`が`{uuid, signature}`を受け取る設計、`buildTransfer`/`sendTransfer`が未署名トランザクションの生成とブロードキャストを分離する設計は、いずれもブラウザ側署名と自然に噛み合う。

### 5.3 二重実行防止・見積もり失効・エラーハンドリング

**Decision**:
- **冪等性**: フロントエンドが承認アクションごとに一意の冪等性キー（UUID）を生成し、確認画面表示時にDynamoDBへ`attribute_not_exists`条件付きで記録する。同一キーでの再試行は既存の処理結果を返し、二重にswap/送金を実行しない（spec.md FR-012対応）。
- **見積もり失効**: `sera-mcp`の`get_quote`が返す有効期限をDynamoDBにTTL付きで保存し、実行時に有効期限切れであれば再見積もりを要求する（FR-011対応）。
- **ブロードキャスト済み・結果不明の取引の追跡**: `sendTransfer`/`execute_swap`実行直後は「broadcastしたが未確定」の状態でDynamoDBに記録し、US6（結果照会）はこのレコードを起点に`settlement_status`等でオンチェーン状態を再確認する。
- **残高不足・ガス不足・署名拒否・外部API障害**: いずれもsera-mcp側のツール応答またはPrivyの署名フローのエラーをアプリ層で捕捉し、spec.md FR-016/FR-017/FR-020に従いチャットで理由を提示する。

### 5.4 テスト環境の対応状況（実コード確認、スパイクS6で追加調査済み）

`docs/memo.md`§6の要求に対し、sera-mcp(v1)の`src/config.ts`（commit `d6f50c1aa6098354d796b777a5474989e9acc1f7`）を確認した結果、`POLICY_DRY_RUN`環境変数によるdry-runモードが実在することを確認した（詳細: [spikes/s6-dry-run/findings.md](./spikes/s6-dry-run/findings.md)）。加えて`maxNotionalUsd`・`allowedRecipients`・`allowedSymbols`・`defaultExpirationSeconds`等を持つ`PolicyEngine`という多層防御レイヤーが既に存在することも判明した。開発・自動テストでは`SERA_NETWORK=sepolia`＋`POLICY_DRY_RUN=true`を第一候補とする。

---

## 6. モノレポ構成・API契約

### 6.1 ディレクトリ構成の方針

**Decision**: 既存の`AGENTS.md`が示す構成（`apps/cdk`, `apps/backend`, `apps/frontend`, `packages/shared`, `packages/api-spec`）を土台に、新規ディレクトリの追加は最小限にとどめる。エージェントオーケストレーション（Strands Agent＋sera-mcp呼び出し）は`apps/backend`内のモジュール（例: `apps/backend/src/agent/`）として実装し、独立パッケージには分離しない。

**Rationale**: エージェントロジックはHonoアプリと同一Lambda内で完結し（§4.2）、他のアプリから再利用される予定もないため、独立パッケージに分離する必然性がない（過剰な抽象化を避ける、`.claude/rules/code-style.md`の方針にも合致）。詳細なディレクトリツリーは本ファイルの「Project Structure」セクション（plan.md）に記載する。

### 6.2 OpenAPI・生成コード

**Decision**: `packages/api-spec/openapi.yaml`をREST API契約の正本とし、**`openapi-typescript` + `openapi-fetch`**（Zero-Java、TypeScriptのみで完結）で`packages/api-spec`配下に型定義と軽量な型安全fetchクライアントを生成する。Honoの実装（`apps/backend`）と生成コード（フロントエンドが利用する型・クライアント）の整合性は、CIで生成コマンドを実行し差分がないことを確認するステップ（`git diff --exit-code`相当）で担保する。MCPのツール定義（sera-mcp側のツールスキーマ）はこのOpenAPI契約に含めない。両者は別レイヤーの契約であり、フロントエンドはMCPツールを直接呼び出さない（常にバックエンドのREST APIを経由する）。

**Rationale**: 憲章 原則VI（API契約ファーストと生成コードの整合性、REST APIとMCPツール定義の区別）に直接対応。`docs/memo.md`は「OpenAPI Generator」（`@openapitools/openapi-generator-cli`、Javaベース）を原則採用としているが、スパイクS7（[spikes/s7-openapi-gen/findings.md](./spikes/s7-openapi-gen/findings.md)）で実行確認した通り、ローカル環境のJavaバージョン（1.8, class file version 52.0）が`@openapitools/openapi-generator-cli@2.41.0`の要求するJava 11相当（class file version 55.0）を満たせず`UnsupportedClassVersionError`で起動不能だった。これは`docs/memo.md`が指定する互換性検討の対象事例であり、問題点・根拠・代替案・推奨案はS7のfindings.mdに記録した上で、Zero-JavaかつCIでの追加ランタイム導入が不要な`openapi-typescript`+`openapi-fetch`を代替として採用する。

**Alternatives considered**: `@openapitools/openapi-generator-cli`（Java互換性問題により不採用）、`orval`（型+TanStack Queryフック自動生成まで行うが依存が増えるため、まずはより薄い`openapi-typescript`+`openapi-fetch`から始める）。

---

## 7. 技術スタック全体の互換性評価

`docs/memo.md`が指定する技術リストのうち、本調査で個別の互換性確認を行っていない項目（React Bits, TanStack, Turbo, CodeRabbit等）については、致命的な非互換の兆候は見つかっていないが、深い検証はしていない（主観）。これらは実装フェーズの技術検証（§8）またはタスク着手時に個別確認する。特筆すべき懸念のみ以下に記す。

- **OpenAPI Generator（`@openapitools/openapi-generator-cli`）**: スパイクS7で実行確認の結果、Java互換性問題（Java 8環境で`UnsupportedClassVersionError`）により不採用と判断し、`openapi-typescript`+`openapi-fetch`を代替として採用した。詳細は§6.2および[spikes/s7-openapi-gen/findings.md](./spikes/s7-openapi-gen/findings.md)を参照。
- **Turbo**: 現状`AGENTS.md`にはTurboのスクリプトは存在せず、pnpmワークスペースの`--filter`のみで運用されている。Turboの導入はビルドキャッシュ・タスクオーケストレーションの利点があるが、必須ではない。初期実装では現行のpnpm運用を維持し、ビルド時間が問題になった時点でTurbo導入を検討する（YAGNI、追加ツールの導入コストを避ける）。
- **Node.jsバージョン**: `@strands-agents/sdk`がNode.js 22+を要求する（§2）。AWS LambdaのNode.jsランタイムが22.xを提供しているかは本調査で未確認であり、技術検証タスクとする（§8）。未提供の場合はLambda用にコンテナイメージデプロイまたはカスタムランタイムを検討する必要がある。

---

## 8. 技術検証（スパイク）計画

`docs/memo.md`は「実装上の不確実性が大きい部分は、先に行う小さな技術検証と、その合格条件を定義してください」と要求している。以下を実装着手前の技術検証タスクとする（コードは本ターンでは実装しない）。

| # | 検証項目 | 合格条件 | 優先度 |
|---|---|---|---|
| S1 | AWS LambdaがNode.js 22.xランタイムを提供しているか | 公式ドキュメントで`nodejs22.x`ランタイムの存在を確認する。存在しない場合はコンテナイメージデプロイの要否を判断する | 高（§2, §7の前提） |
| S2 | Lambda Function URLsのレスポンスストリーミングと、Strands TS SDKのストリーミング出力（もしあれば）を接続できるか | ダミーのストリーミングレスポンスをLambda Function URL経由でブラウザまで届け、トークン単位の逐次表示ができることを最小構成で確認する | 高（§4.1の前提） |
| S3 | `sera-mcp`(v1)を`--transport http --stateless`で起動し、Lambda相当の単発呼び出しパターンから疎通できるか | ローカルまたはLambda環境で`get_quote`等の読み取り系ツールを1回のHTTPリクエストで呼び出し、レスポンスを取得できる | 高（§4.2の前提） |
| S4 | Strands TS SDK（`@strands-agents/sdk`）からBedrock（`jp.anthropic.claude-sonnet-4-6`等のリージョン限定推論プロファイルID）を指定してエージェントを実行できるか | 最小構成のAgentがBedrock経由で応答を返し、ツール呼び出し（ダミーツール）が機能することを確認する | 高（§3の前提） |
| S5 | Privyのembedded walletでクライアント側署名を行い、`sera-mcp`の`execute_swap`/`sendTransfer`が期待する署名形式（EIP-712 / 署名済み生トランザクション）と適合するか | Sepoliaテストネット上でPrivyのサンプルウォレットにより署名を生成し、sera-mcpのツールに受理される形式であることを確認する（実際のブロードキャストは本ターンでは行わない） | 高（§5.2の前提、資金移動の安全性に直結） |
| S6 | `sera-mcp`(v1)にdry-run/テストモードが存在するか | ソースコードを直接確認し、存在すればその使用方法を記録、存在しなければモック戦略を別途設計する | 中 |
| S7 | OpenAPI GeneratorによるTypeScriptクライアント生成と、Honoの型定義との整合性確認フローが機能するか | サンプルのOpenAPI定義から生成したクライアントの型が、Hono側のルート定義と手動比較で一致することを確認する | 中 |

これらの検証結果は、`/speckit-plan`の再実行または`/speckit-tasks`でのタスク化を通じて反映する。

---

## 9-B. 実装中に判明した訂正: sera-mcpの実ツール名・引数・署名データ（Phase 7で実ソースと突き合わせ）

送金実装の際に`sera-cx/sera-mcp`@`d6f50c1a`の`src/tools/registry.ts`・`schemas.ts`・`core.ts`・`signer.ts`を実読し、
**Phase 4〜6の実装が前提にしていた名前・引数・形が誤っていた**ことが判明したため訂正した（`apps/backend/src/agent/sera-tools.ts`に集約）。
当時のvitestはモックが誤った名前を受け入れていたため合格しており、**実接続では全ツール呼び出しが失敗する状態だった**。

| 項目 | 誤っていた前提 | 実ソースで確認した事実 |
|---|---|---|
| ツール名 | `get_quote` `execute_swap` `get_balances` `probe_depth` `settlement_status` | すべて`sera.`接頭辞付き（例: `sera.get_quote`） |
| get_balances引数 | `{address}` | `{owner_address}` |
| get_quote引数 | `{fromToken,toToken,amount}` | `{from,to,amount,owner_address(必須)}` |
| 板情報 | `probe_depth` | 正式な合成板は`sera.infer_book {base,quote}`（`probe_depth`は価格インパクト計測） |
| settlement_status引数 | `{userId}` | `{owner_address,uuid?,trade_id?,limit?}` |
| MCP応答 | 解析済みオブジェクトとして扱っていた | `content[].text`のJSON文字列。`isError`も要処理（`callSeraTool`で解析・例外化） |
| 署名データ | `route_params`のみで署名可能 | `route_params`は**Intentのmessage部のみ**。domain（`sera://config`の`eip712_domain`）とIntent型を合成する必要あり |
| permit | 未考慮 | quoteの`permit`が非nullならEIP-2612の追加署名（`permit_signature`+`permit_deadline`）が必須。**現状は未対応**として`PERMIT_NOT_SUPPORTED`で明示的に拒否 |
| 送金 | `buildTransfer`/`sendTransfer` | `sera.build_transfer {token(コントラクトアドレス),to,amount(最小単位uint256),from_address}` → 未署名tx。`sera.send_transfer {raw_tx}`は署名済みtxを**検証せず**ブロードキャスト |
| 認証 | 未考慮 | tx-builder/送信系・get_balances・settlement_statusは**サーバー側`SERA_API_KEY`/`SECRET`（運用者資格情報）が必要** |

**安全上の対処**: `send_transfer`は宛先・数量を検証しないため、FR-010を守るには自前の検証が必須。
`apps/backend/src/agent/tx-verify.ts`（viem）で、ブロードキャスト前に署名済みraw txをデコードし、
トークンコントラクト・宛先・数量・署名者が承認内容と一致することを確認する（実署名txによるテストあり）。

**未検証のまま残っている点**（実疎通が必要）: `get_coin_metadata`/`build_transfer`/`get_balances`の応答のネスト形状、
`fee_breakdown`の構造、`expires_at`の形式、Sera側txオブジェクトのフィールド名（`gas`/`gasLimit`）とPrivy署名APIの対応、
`eip712_domain`のフィールド構成。いずれもコード中で防御的に解釈しているが、S4/S5と同様に認証情報が揃った環境での確認が必要。

## 9-A'. sera-mcpの取り込み（方針A: git submodule + バンドル）— 実施結果

`sera-cx/sera-mcp`を`vendor/sera-mcp`にgit submoduleとして取り込み、**コミット`d6f50c1a`に固定**した（MIT。取り込み・再配布は可能）。

- `pnpm build:sera-mcp`（`scripts/build-sera-mcp.mjs`）: 固定コミットであることを検証 → `npm ci --ignore-scripts` → `tsc` → esbuildで単一ファイル`apps/backend/vendor-dist/sera-mcp.mjs`（3.2MB）へバンドル。
- **`better-sqlite3`（ネイティブ）はスタブへ差し替え**: sera-mcpの履歴DB専用で、静的importのため外部化すると起動時に落ちる。macで作ったバイナリはLambda(Linux)で動かないため、`SERA_HISTORY_DB`未設定なら元々インスタンス化されない点を利用し、誤って有効化した場合は沈黙せず例外になるスタブにした。
- `apps/cdk/lib/backend-stack.ts`: `NodejsFunction`のcommandHooksで両Lambdaのコード直下へ同梱し、`SERA_MCP_BIN=/var/task/sera-mcp.mjs`を設定。**synth結果で両Lambdaの資産に`sera-mcp.mjs`が入っていることを確認済み**。
- 資格情報（`SERA_API_KEY/SECRET`）は**スタック内のSecrets Manager**に保管する。CDKは**空のプレースホルダーのみ**を作成し（値はテンプレートに含まれず、再デプロイで設定済みの値は上書きされない）、実際の値はデプロイ後に利用者が`aws secretsmanager put-secret-value`で設定する。`removalPolicy: DESTROY`でdestroyと共に削除され、名前は固定しない（削除後の復旧期間による同名再作成の失敗を避けるため）。Lambdaには読み取り権限のみ付与し、`SERA_SECRET_ID`にはARNを渡す。ARNはスタック出力`SeraSecretArn`に出す。Secrets Managerの追加コスト（シークレット1件あたり月額課金）が発生する点はREADMEの料金概算に記載する。

**未完・未検証**:
1. バックエンド側で`SERA_SECRET_ID`のシークレットを読んで子プロセスに渡す処理は**未実装**（下記の環境制約）。
2. バンドルした`sera-mcp.mjs`を**実際に起動して疎通した検証は未実施**（構文・自己完結性のみ確認）。ローカルでのサーバー起動が実行環境で許可されなかったため。
3. シークレット未作成のままではSera資格情報を要するツールは実行時に失敗する（README/デプロイ前提条件に明記予定）。

## 9-A. 実装中に判明した新たな課題: sera-mcpはnpmレジストリに未公開

**実コード確認（`/speckit-implement`実行中、2026-09-18）**: `npm view sera-mcp` / `npm view @sera-cx/sera-mcp`はいずれも404で、`sera-mcp`(v1)はnpm公開レジストリに存在しない。`package.json`の`mcpName: "io.github.sera-cx/sera-mcp"`はMCP Registry向けのメタデータであり、npm配布を意味しない。さらに`package.json`の`"build": "tsc"`スクリプトはあるが`"prepare"`スクリプトが無いため、GitHubから直接git依存（`github:sera-cx/sera-mcp#<commit>`）としてインストールしても、`bin`/`main`が指す`dist/`ディレクトリはビルドされず生成されない。

**影響**: `apps/backend`から`sera-mcp`を通常の依存関係として`pnpm add`することはできない。Lambdaへのバンドル方法（CDKの`NodejsFunction`バンドリング、または別途Lambda Layerとしてビルド済み`dist/`を同梱する等）を追加で設計する必要がある。

**暫定対応（本ターンで採用、要ユーザー確認）**: `apps/backend/src/agent/sera-mcp-client.ts`は、`sera-mcp`の実行バイナリパスを環境変数`SERA_MCP_BIN`で受け取り、子プロセスとして起動する設計とした。ビルド済みバイナリの用意方法（CI/デプロイスクリプトで`sera-cx/sera-mcp`を指定コミットでclone・`pnpm install && pnpm build`し、その`dist/`をLambdaバンドルに含める）は`apps/cdk`のバンドリング設定またはデプロイスクリプト（T075）側の未実装課題として残す。

## 9. 未決事項サマリー（実装着手前にユーザー判断または追加調査が必要な項目）

- **【新規・重要】sera-mcpのビルド済みバイナリをLambdaバンドルへ含める具体的な方法**（§9-A）。選択肢: (a) デプロイスクリプトでpinned commitをclone&buildしてLambdaバンドルに同梱, (b) Sera側にnpm公開を依頼, (c) 自前でforkしnpm/GitHub Packagesに公開。ユーザー判断が必要。

- ~~sera-mcp(v1)の決済対象が実際にEthereum Sepoliaかどうか~~ → スパイクS3で解消済み（chainId 11155111を実コードで確認）
- ~~Node.js 22.xランタイムのLambda提供状況~~ → スパイクS1で解消済み（[spikes/s1-lambda-node22/findings.md](./spikes/s1-lambda-node22/findings.md)、公式ドキュメントで確認）
- ~~sera-mcp(v1)のdry-run/テストモードの有無~~ → スパイクS6で解消済み（`POLICY_DRY_RUN`環境変数、[spikes/s6-dry-run/findings.md](./spikes/s6-dry-run/findings.md)）
- sera-mcp v1/v2の関係性（フォーク/後継/無関係）をSeraチームへ確認するかどうか（§1.2、未解消）
- Claude Sonnet 4.6の東京リージョンIn-Region対応可否とトークン単価の詳細（§3、未解消。AWS Bedrock認証情報が必要なため本セッションでは検証不可）
- Lambda内で`sera-mcp`を子プロセス起動する際のコールドスタート・メモリオーバーヘッド（§4.2、未解消。AWS環境での実測が必要）
- Strands TS SDK（`@strands-agents/sdk`）からのBedrock実呼び出し・Privy embedded walletの署名互換性（S4/S5、未解消。AWS/Privyの認証情報が必要なため本セッションでは検証不可）

## 3-A. モデル変更の記録（Amazon Nova 2 Lite）

**Decision（2026-09-19、ユーザー指示）**: AWSクレジットで賄うため、既定モデルを Claude Sonnet 4.6 から **Amazon Nova 2 Lite** に変更する。§3 の選定（Claude Sonnet 4.6）はこの決定で置き換える。

- モデルID: `jp.amazon.nova-2-lite-v1:0`（Geo推論ID）。`global.amazon.nova-2-lite-v1:0` も存在する。**ドキュメント確認**（AWS Bedrock ユーザーガイド「Nova 2 Lite」モデルカード、ap-northeast-1 がクロスリージョン推論の対応に含まれる）。
- 環境変数 `BEDROCK_MODEL_ID` で差し替え可能。Claude 等へ戻す場合は CDK の IAM 許可（`backend-stack.ts`、現在は `amazon.nova-*` のみ）を広げる。
- 副次的な発見: 変更前の CDK には Bedrock 呼び出しの IAM 権限が無かった。`bedrock:InvokeModel` / `InvokeModelWithResponseStream` を追加し、テストで確認。
- **未確認**: Strands TS SDK + Nova でのツール呼び出し・ストリーミング、日本語応答品質（スパイクS4は Nova で実施し直す必要がある）、実際の単価とクレジット適用可否。

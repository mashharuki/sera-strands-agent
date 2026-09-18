# Implementation Plan: Sera Protocol AIチャットボット

**Branch**: `001-sera-protocol-chatbot` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-sera-protocol-chatbot/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

AWS上にSera Protocol専用のフルサーバーレスAIチャットボットを構築する。ユーザーはWebチャットから自然言語で、ウォレット作成・残高確認・板/価格/取引履歴照会（読み取り系）と、stablecoin swap・送金（資産変更系、チャット承認＋ユーザー自身のウォレットでの暗号学的署名を必須とする非カストディアル方式）を行える。技術的アプローチは、AWS CDK + Lambda + API Gateway（読み取り/実行系）+ Lambda Function URLsストリーミング（チャットターン）+ DynamoDB（状態保存）+ S3/CloudFront（フロントエンド配信）による完全サーバーレス構成。エージェントオーケストレーションはStrands Agents TypeScript SDK（`@strands-agents/sdk`、`strands-agents/harness-sdk`配下、Bedrock Claude Sonnet 4.6を既定モデルとする）、資産操作は`sera-mcp`（v1, `github.com/sera-cx/sera-mcp`、非カストディアルな`external`署名モード）をLambda内蔵で呼び出す。ウォレット作成・認証・署名はPrivyのembedded walletがクライアント側で担う。詳細な調査結果と根拠は[research.md](./research.md)を参照。

## Technical Context

**Language/Version**: TypeScript（モノレポ内で複数バージョンが併存: ルート`^7.0.2`、`apps/cdk`は`~5.5.3`、`apps/frontend`は`~6.0.2`。`AGENTS.md`の既存方針に従い、本フィーチャーでは統一を強制しない）。Node.jsはLambda実行環境として`22.x`を目標とするが、AWS Lambdaでの提供有無は未検証（[research.md](./research.md) §7・技術検証S1）。

**Primary Dependencies**: AWS CDK（TypeScript）、Hono（`hono/aws-lambda`）、`@strands-agents/sdk`（Strands Agents TS SDK, harness-sdkモノレポ由来）、`sera-mcp`（v1, `github.com/sera-cx/sera-mcp`、MCPクライアントとしてStreamable HTTP statelessモードで呼び出す）、React 19 + Vite、zod、zustand、TanStack Query、`@privy-io/react-auth`（クライアント側認証・ウォレット・署名）、OpenAPI Generator（TypeScriptクライアント生成）、Biome。

**Storage**: Amazon DynamoDB（オンデマンドキャパシティ、単一テーブル設計を候補とする）。会話履歴、ユーザー↔ウォレット対応、見積もり(Quote、TTL付き)、承認リクエスト、トランザクション状態、冪等性キーを保存する。Lambdaの一時領域・メモリには永続状態を一切置かない（憲章 原則II）。

**Testing**: vitest（`apps/backend`・`apps/frontend`の単体テスト）、Jest（`apps/cdk`、既存構成を継続）、Playwright（UIからのE2E）、Postman/Newman（OpenAPI契約に基づくAPIテスト）。

**Target Platform**: AWS Lambda（Node.js 22.x目標）+ Amazon API Gateway（HTTP API、読み取り・実行系エンドポイント）+ Lambda Function URLs（レスポンスストリーミング、チャットターンのみ）+ Amazon S3 + CloudFront（フロントエンド静的配信）。LLM基盤はAmazon Bedrock（Claude Sonnet 4.6、リージョンap-northeast-1を軸に`jp.anthropic.claude-sonnet-4-6`ジオ推論プロファイル）。

**Project Type**: Web application（モノレポ: フロントエンドSPA + バックエンドAPI/エージェント + IaC + API仕様 + 共有型）。既存の`apps/*` / `packages/*`構成（Web application: Option 2）を踏襲する。

**Performance Goals**: spec.md SC-002は「必要情報が揃った照会の80%以上が一回の往復で回答される」を規定するが、具体的なレイテンシ目標（p95応答時間等）はspec.mdでは意図的に未規定（`/speckit-clarify`でアーキテクチャ依存として計画フェーズに委譲）。本plan.mdでの暫定目安は「チャットの初回トークン表示は5秒以内」とするが、これは実測前の仮目標であり、技術検証（[research.md](./research.md) §8, S2/S4）の結果を踏まえ`/speckit-tasks`または次回`/speckit-plan`更新時に正式なSuccess Criteriaとして追加するかを判断する。

**Constraints**: Amazon API Gatewayの統合タイムアウト上限29秒（チャット以外のエンドポイントはこの制約内に収める設計とし、チャットターンはLambda Function URLsストリーミングで回避、[research.md](./research.md) §4.1）。Lambdaの一時領域・メモリに永続状態を依存させない（憲章 原則II）。バックエンドは秘密鍵・署名情報を一切保持・ログ出力しない（憲章 原則V）。

**Scale/Scope**: spec.md Assumptionsに基づき、大規模本番サービスを想定しない小〜中規模のデモ・教材利用を前提とする。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. 調査・計画ファースト | **PASS** | 本plan.mdはコード変更・デプロイ・オンチェーン取引を一切行わず、sera-mcp/sera-agents/Strands/Bedrockの実コード・公式ドキュメント調査（[research.md](./research.md)）に基づいて作成した。未確認事項は「未確認・推測」として明示的に区別している。 |
| II. フルサーバーレス・アーキテクチャの堅持 | **PASS** | Lambda + API Gateway + Lambda Function URLs + DynamoDB + S3/CloudFrontのみで構成し、常駐サーバー・コンテナを持たない。`sera-mcp`もLambda内蔵実行とし、別サービス常駐案は不採用（[research.md](./research.md) §4.2）。 |
| III. 読み取り操作と資産変更操作の分離、明示的承認 | **PASS**（設計方針、実装はtasksで検証） | API設計（[contracts/openapi.yaml](./contracts/openapi.yaml)）で読み取り系（`GET /wallet`, `GET /market/*`）と資産変更系（`POST /transactions/*/prepare`→`confirm`）のエンドポイントを分離し、`confirm`は承認内容と一致するペイロード＋署名を必須とする。 |
| IV. チェーン状態に基づく実行結果の検証 | **PASS**（設計方針） | トランザクション状態は`sera-mcp`の`settlement_status`等の照会結果に基づきDynamoDBへ反映し、LLM生成文のみでの成功判定を行わない（[data-model.md](./data-model.md) Transactionエンティティ）。 |
| V. 秘密情報の非露出とウォレット所有権の検証 | **PASS** | 署名はPrivyのクライアント側embedded walletで行い、バックエンドは秘密鍵を扱わない（`sera-mcp`のexternal署名モードと整合、[research.md](./research.md) §5.2）。所有権検証はDynamoDBのユーザーID⇄ウォレットの1:1マッピングで実施。 |
| VI. API契約ファーストと生成コードの整合性 | **PASS** | `packages/api-spec/openapi.yaml`を正本とし、MCPツール定義（sera-mcp側）とは明確に別契約として扱う（[research.md](./research.md) §6.2）。 |
| VII. 再現性のあるドキュメントを成果物として扱う | **PASS（計画段階）** | README・ブログ原稿の作成はspec.mdのスコープ外（本featureはアプリ機能要件）だが、`/speckit-tasks`での段階的実装計画にREADME更新・技術検証記録を含めることをここで明記する。 |

**違反なし**。Complexity Trackingセクションへの記載は不要。

**Post-Design再確認（Phase 1完了後）**: [data-model.md](./data-model.md)・[contracts/openapi.yaml](./contracts/openapi.yaml)・[contracts/mcp-tools.md](./contracts/mcp-tools.md)・[quickstart.md](./quickstart.md)を作成した時点で本Constitution Checkを再評価した。ApprovalRequestの`approvedContentSnapshot`による内容一致保証（原則III・IV）、`approvalId`を用いた冪等性設計（原則IIの一部、FR-012）、MCPツール契約とREST API契約の明示的分離（原則VI、`contracts/mcp-tools.md`）が設計に反映されており、新たな違反は生じていない。**PASS（変更なし）**。

## Project Structure

### Documentation (this feature)

```text
specs/001-sera-protocol-chatbot/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── openapi.yaml
│   └── mcp-tools.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

既存の`AGENTS.md`が示すモノレポ構成（Web application: Option 2相当）を踏襲し、新規ディレクトリの追加は最小限にとどめる。

```text
apps/
  cdk/                      # AWS CDKインフラ定義（既存、空スタックから拡張）
    lib/
      backend-stack.ts      # Lambda(Hono API + Function URL) + API Gateway HTTP API
      frontend-stack.ts     # S3 + CloudFront
      data-stack.ts         # DynamoDB
    test/

  backend/                  # Hono API、Lambdaハンドラーとしてデプロイ（既存、拡張）
    src/
      routes/                # REST APIルート（openapi.yamlに対応）
        wallet.ts
        market.ts
        transactions.ts
        chat.ts              # Lambda Function URL ストリーミングハンドラー
      agent/                 # Strands Agentオーケストレーション（新規、本アプリ内モジュール）
        strands-client.ts
        sera-mcp-client.ts   # sera-mcp(v1) MCPクライアント呼び出し
        tools/
      store/                 # DynamoDBアクセス層（新規）
        conversations.ts
        wallets.ts
        quotes.ts
        transactions.ts
        idempotency.ts
      auth/                  # Privy発行JWT検証（新規）
    test/

  frontend/                 # Vite + React 19 SPA（既存、拡張）
    src/
      components/
      pages/
      features/
        chat/
        wallet/
        transactions/
      services/              # 生成クライアント利用ラッパー
    test/

packages/
  shared/                   # フロントエンド/バックエンド共有型（既存、拡張）
    src/
  api-spec/                 # OpenAPI YAML正本 + 生成クライアント（既存、拡張）
    openapi.yaml
    generated/               # OpenAPI Generator出力（gitignore対象は実装時に決定）

docs/
  memo.md                   # 既存の設計ブリーフ
  architecture/              # 新規: .drawio + SVG/PNGのアーキテクチャ図（README/ブログ用、後続フェーズ）
  blog/                      # 新規: 技術ブログ原稿（後続フェーズ）
```

**Structure Decision**: 既存のpnpmワークスペース構成（`apps/*`, `packages/*`）をそのまま拡張する。エージェントオーケストレーション（Strands Agent + sera-mcp呼び出し）は独立パッケージに分離せず、`apps/backend/src/agent/`としてHonoアプリと同一Lambda内に実装する（[research.md](./research.md) §4.2・§6.1の決定に基づく。理由: 他アプリからの再利用予定がなく、同一Lambdaプロセス内で完結するため、パッケージ分離は過剰な抽象化になる）。

## Complexity Tracking

*Constitution Checkに違反なし。本セクションは空欄とする。*

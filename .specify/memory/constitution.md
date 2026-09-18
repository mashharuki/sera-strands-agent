<!--
Sync Impact Report
- Version change: (unratified template) → 1.0.0
- Rationale: Initial ratification. The previous file contained only unfilled
  template placeholders and was never an adopted constitution.
- Modified principles: N/A (initial adoption)
- Added sections:
  - Core Principles I–VII
    (調査・計画ファースト / フルサーバーレス・アーキテクチャの堅持 /
     読み取り操作と資産変更操作の分離、明示的承認 /
     チェーン状態に基づく実行結果の検証 / 秘密情報の非露出とウォレット所有権の検証 /
     API契約ファーストと生成コードの整合性 / 再現性のあるドキュメントを成果物として扱う)
  - 技術スタックと制約 (Section 2)
  - 開発ワークフローと品質ゲート (Section 3)
  - Governance
- Removed sections: none
- Deferred/TODO placeholders: none — all fields resolved from docs/memo.md and
  AGENTS.md at time of ratification.
- Templates reviewed for consistency: .specify/templates/plan-template.md,
  spec-template.md, tasks-template.md were not modified by this command
  (out of scope per speckit-constitution scope guard). A follow-up review is
  recommended the next time /speckit-plan runs for this feature to confirm
  each principle here has a corresponding gate in plan-template's
  Constitution Check section.
-->

# Sera AI Agent Constitution

## Core Principles

### I. 調査・計画ファースト（実装より先に検証する）
新機能の着手時は、実装・AWSへのデプロイ・オンチェーン取引を行う前に、既存ソースコード
（`sera-mcp`、`sera-agents` 等の参照リポジトリを含む）と公式ドキュメントの調査、要件整理、
アーキテクチャ設計、実装計画の作成を完了しなければならない（MUST）。存在しないSDK・ツール・
API・テストネットを仮定してはならず（MUST NOT）、調査済みの事実と未検証の仮説は明確に分けて
記録しなければならない（MUST）。計画の合意が得られるまでは、確認・調査目的を超えるコード変更・
デプロイ・送金/署名を伴う操作を行ってはならない（MUST NOT）。

**根拠**: 本プロジェクトはSera Protocol・Strands Agents・MCPという読者にとって未知の技術を
扱う教材であり、誤った前提での実装は手戻りとオンチェーン上の取り返しのつかない実害を招く。
`AGENTS.md` が明記する通り、現時点でSera/Strands/Privy統合は一切実装されていないため、
既存実装が「ある」という前提を排除することが特に重要である。

### II. フルサーバーレス・アーキテクチャの堅持
本アプリケーションは、アプリ側で常時稼働するサーバーやコンテナの運用を必要としない構成
（AWS CDK + Lambda + API Gateway + S3 + CloudFront を中核とする）でなければならない（MUST）。
Lambda/API Gatewayのタイムアウト制約と長時間処理（MCP接続の起動、AIエージェントの推論、
チェーン状態のポーリング等）への対応方針は、実装前に明示しなければならない（MUST）。
会話履歴・ユーザーとウォレットの対応・取引状態などの永続データは、Lambdaの一時領域や
メモリに依存させてはならず（MUST NOT）、明示的な永続ストレージに保存しなければならない
（MUST）。sera-mcpをLambda内で起動する案と別サービスに分離する案は、コールドスタート・
状態管理・コストの観点から比較検討し、採用理由を記録しなければならない（MUST）。

**根拠**: 「フルサーバーレス」は本プロジェクトの中核テーマであり、教材としての再現性・
低コスト・保守性はサーバーレス制約の遵守と表裏一体である。

### III. 読み取り操作と資産変更操作の分離、明示的承認
ウォレット残高確認・板/取引情報取得・見積もり取得などの読み取り操作と、swap・送金などの
資産を変更する操作は、実装・API設計・UIのいずれのレイヤーでも明確に区別しなければならない
（MUST）。資産を変更する操作は、対象ネットワーク・トークン・数量・送信先・手数料・
スリッページ等の必要情報を確認画面に表示し、ユーザーの明示的な承認を得た後にのみ実行して
よい（MUST）。見積もりの期限切れや条件変更が発生した場合は再確認を要求しなければならず
（MUST）、承認した取引内容と実際に実行される内容は一致しなければならない（MUST）。
二重クリック・APIの再試行・タイムアウトによる二重実行を防止する冪等性の仕組みを設けな
ければならない（MUST）。

**根拠**: AIエージェントが自然言語から資産操作を実行する構成では、誤操作・二重実行・
承認なき実行がユーザー資産の直接的な損失に直結する。この分離と承認フローは交渉不可能
（NON-NEGOTIABLE）の安全境界である。

### IV. チェーン状態に基づく実行結果の検証（NON-NEGOTIABLE）
取引（swap・送金）の成功・失敗は、LLMが生成した文章のみを根拠に判定してはならない
（MUST NOT）。ツールの実行結果（トランザクションハッシュ、レシート等）とチェーン上の
実際の状態を照会した結果を根拠として、実行結果とトランザクション状態をユーザーに表示
しなければならない（MUST）。ブロードキャスト済みだが結果が不明な取引は、状態不明として
追跡可能な形で扱わなければならない（MUST）。

**根拠**: LLMの出力は事実の裏付けなく成功を主張しうる。金銭的な操作において、この
検証を怠ることは利用者への誤情報提供に直結するため、原則からの逸脱を認めない。

### V. 秘密情報の非露出とウォレット所有権の検証
秘密鍵、署名情報、認証トークン等の機密情報は、LLMへのプロンプト、ブラウザ配布物、
ログ、エラーメッセージのいずれにも露出させてはならない（MUST NOT）。認証済みユーザーと
操作対象ウォレットの所有関係は、資産変更操作の実行前に必ず検証しなければならない
（MUST）。モデルの判断のみでは送金・swapを実行できないよう、アプリケーション側の
制御で担保しなければならない（MUST）。同時実行時に複数ユーザーの認証情報・署名情報が
混在しないよう設計しなければならない（MUST）。Privyが担う「ユーザー認証」「ウォレット
作成」「署名」「鍵管理」の役割は明確に分離して文書化しなければならない（MUST）。

**根拠**: `.claude/rules/security.md` の秘密情報管理原則をウォレット/署名領域に
拡張したものであり、金融資産を扱うプロダクトでは特に高い優先度を持つ。

### VI. API契約ファーストと生成コードの整合性
OpenAPI YAMLをREST API契約の正本とし、Honoによる実装は生成された型・クライアントとの
整合性を継続的に検証しなければならない（MUST）。REST APIの契約とMCPのツール定義は
別物として区別し、混同してはならない（MUST NOT）。生成コードと手書きコードの境界は
明示しなければならない（MUST）。PostmanコレクションとNewmanによるAPIテストは契約の
検証手段として維持しなければならない（MUST）。

**根拠**: OpenAPI-firstは`docs/memo.md`が定めるAPI設計方針であり、生成物との乖離は
フロントエンド・バックエンド間の実行時不整合を招く。

### VII. 再現性のあるドキュメントを成果物として扱う
README（環境構築・デプロイ・動作確認・削除の再現手順を含む）と技術ブログ原稿は、
コードと同格の成果物として扱わなければならない（MUST）。ブログ原稿およびREADMEに
記載する実行結果・スクリーンショット・計測値は、実測後にのみ反映してよく（MUST）、
未検証の内容を動作確認済みとして記述してはならない（MUST NOT）。`pnpm deploy` /
`pnpm destroy` に類するコマンドで示す「削除対象」の範囲は明確に定義し、削除されずに
残るリソース（オンチェーンのウォレットや取引履歴等）はREADMEに明記しなければならない
（MUST）。

**根拠**: 本プロジェクトの成果物は「動くサンプルアプリ」「再現可能なREADME」
「解説ブログ」の3点セットであり（`docs/memo.md` §1）、教材としての価値はドキュメントの
正確性と再現性に依存する。

## 技術スタックと制約

`docs/memo.md` が指定する技術スタック（AWS CDK、Lambda、API Gateway、S3、CloudFront、
Strands Agents TypeScript SDK、Hono、React、Vite、React Bits、zod、zustand、Privy、
Ethereum Sepolia、TanStack、sera-mcp、sera-agents、vitest、Playwright、pnpm workspaces、
Biome、OpenAPI YAML、OpenAPI Generator、Postman、Newman、CodeRabbit、Turbo）を原則の
構成として採用しなければならない（MUST）。互換性や実行環境上の問題がある場合に限り
逸脱を認めるが、その際は問題点・根拠・代替案・推奨案をplan.md等に明文化しなければ
ならない（MUST）。

LLM基盤はAmazon Bedrockを第一候補とし、モデル・リージョン・利用条件とStrands Agentsとの
対応関係は実装前に調査し記録しなければならない（MUST）。状態保存やシークレット管理の
ために追加のAWSサービス（例：DynamoDB、Secrets Manager、SSM Parameter Store）が
必要な場合は、その目的と追加コストを説明しなければならない（MUST）。

`AGENTS.md` が記録する現在の実装状況（バックエンドはHelloルートのみ、CDKスタックは
空、フロントエンドは素のVite+Reactテンプレート、Strands/Privy/sera-mcp/sera-agents等の
依存関係は未導入）は開発の出発点である。統合が既に存在するという前提を置く前に、
必ず現在のファイル内容を確認しなければならない（MUST）。

## 開発ワークフローと品質ゲート

pnpmモノレポの各ワークスペース（`apps/cdk`、`apps/backend`、`apps/frontend`、
`packages/shared`、`packages/api-spec`）に対して、lint（Biome、フロントエンドは
oxlint）・型チェック・ビルドを実装完了の前提条件としなければならない（MUST）。
OpenAPI仕様と生成コードの整合性は、生成コマンドの実行結果（生成差分）を確認する
ことで検証しなければならない（MUST）。Postman/NewmanによるAPIテストは、秘密情報を
コミットしない環境変数管理方式のもとで運用しなければならない（MUST）。

認証・ユーザー分離・取引承認・二重実行防止といった安全境界（Core Principles III–V）は、
UIから主要機能までのE2E確認（Playwright）で検証しなければならない（MUST）。CDKの
変更は`cdk synth`/`cdk diff`による検証を経てからデプロイしなければならない（MUST）。
`pnpm deploy -- --stage <stage>` / `pnpm destroy -- --stage <stage>` に相当する
単一コマンドのデプロイ・削除フローを整備する際は、新規環境でREADMEの手順を再現できる
ことを完了条件に含めなければならない（MUST）。

Gitワークフロー（ブランチ命名、Conventional Commits、レビュー観点）は
`.claude/rules/git-workflow.md` に従う。Spec Kit成果物（本憲章を含む）は
`.claude/rules/speckit-language.md` に従い日本語で記述する。

## Governance

本憲章は、アーキテクチャ・安全境界・セキュリティに関する統治レベルの原則において、
矛盾する他のプロジェクト慣行に優先する（MUST）。日々のコーディング規約・運用手順は
引き続き`AGENTS.md`および`.claude/rules/*.md`が定めるが、これらの内容が本憲章と
矛盾する場合は本憲章を優先し、矛盾するルールファイルの側を修正しなければならない
（MUST）。

**改訂手続き**: 本憲章の改訂は`/speckit-constitution`コマンドを通じて行う。バージョンは
セマンティックバージョニングに従う：既存原則の後方互換性のない削除・再定義はMAJOR、
新規原則の追加や既存ガイダンスの実質的拡張はMINOR、文言修正や非意味的な明確化は
PATCHとする。改訂時は本ファイル冒頭のSync Impact Reportを更新しなければならない
（MUST）。

**コンプライアンスレビュー**: `/speckit-plan`および`/speckit-tasks`が生成する成果物は、
実装着手前に本憲章の原則（特にIII〜V）との整合性を確認しなければならない（MUST）。
原則からの逸脱や複雑さの増加が避けられない場合は、plan.md等にその正当化根拠を
明記しなければならない（MUST）。日々の実装判断における具体的なコマンド・ディレクトリ
構成・運用ルールは`AGENTS.md`を参照する。

**Version**: 1.0.0 | **Ratified**: 2026-09-18 | **Last Amended**: 2026-09-18

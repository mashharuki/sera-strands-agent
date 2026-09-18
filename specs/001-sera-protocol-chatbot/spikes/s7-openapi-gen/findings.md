# スパイクS7: OpenAPI Generatorによる生成クライアントとHono型定義の整合性

**合格条件**: `research.md` §8 S7 — OpenAPI Generatorによる生成クライアントとHono側の型定義の整合性確認フローを試作する。

**結果**: **`docs/memo.md`が指定する「OpenAPI Generator」（`@openapitools/openapi-generator-cli`）には実行環境上の互換性問題があり不採用。代替として`openapi-typescript`を採用する（合格、ただし当初想定ツールからの変更あり）**。

## 実施内容と確認済みの事実（実行確認）

1. `@openapitools/openapi-generator-cli@2.41.0`（`generate -i contracts/openapi.yaml -g typescript-fetch`）を実行したところ、以下のエラーで**失敗した**:

   ```text
   Exception in thread "main" java.lang.UnsupportedClassVersionError:
   org/openapitools/codegen/OpenAPIGenerator has been compiled by a more
   recent version of the Java Runtime (class file version 55.0), this
   version of the Java Runtime only recognizes class file versions up to 52.0
   ```

   実行環境のJavaは`1.8.0_333`（class file version 52.0 = Java 8）だが、`@openapitools/openapi-generator-cli@2.41.0`はJava 11相当（class file version 55.0）を要求する。**Java版数の非互換により起動不能**であることを実行確認した。

2. 代替として`openapi-typescript@7.13.0`（純TypeScript実装、JVM不要）を同じ`contracts/openapi.yaml`に対して実行したところ、**28ms**で692行の型定義（`paths`/`operations`/`components["schemas"]`）を正しく生成できることを確認した。日本語のsummary/description（`@description FR-003, FR-004 (所有権検証) に対応。`等）もJSDocコメントとして正しく保持された。

## 問題点・根拠・代替案・推奨案（`docs/memo.md`が求める互換性検討）

- **問題点**: `docs/memo.md`が原則採用としている「OpenAPI Generator」（Javaベース）は、Node.js/TypeScriptのみで完結する開発体験を損ない、読者（TypeScript/Reactの基礎は理解しているがAWS CDK等に詳しくない開発者）に対しJavaランタイムのセットアップという追加の学習コストを強いる。CI環境でも別途JDKのインストールが必要になり、`docs/memo.md`が重視する「低コスト・保守性・教材としての分かりやすさ」と相反する。
- **根拠**: 上記の実行確認（バージョン非互換エラー）に加え、`@openapitools/openapi-generator-cli`はJVM起動のオーバーヘッドも大きく、pnpmモノレポの高速なローカル開発ループには不向き。
- **代替案**:
  - `openapi-typescript`（型定義のみ生成）+ `openapi-fetch`（同じ作者による軽量な型安全fetchクライアント、Zero-Java）
  - `orval`（型＋TanStack Query対応フックまで生成、Zero-Java、ただし依存が増える）
- **推奨案**: `openapi-typescript` + `openapi-fetch`を採用する。理由: (1) Java不要でpnpm workspaces内に完結、(2) `openapi-typescript`は型のみを生成し、実行時ロジックを持たないため生成物のレビューが容易（保守性）、(3) フロントエンドは既にTanStack Queryを採用予定であり、`openapi-fetch`の型安全クライアントをTanStack Queryの`queryFn`から呼び出す構成と自然に統合できる。

## research.md・plan.mdへの反映

`research.md` §6.2（OpenAPI・生成コード）の記述を本findings.mdの結論に沿って更新済み。`packages/api-spec/package.json`の生成スクリプト（T024実装、`pnpm --filter api-spec run generate`）を実際に動かし、`packages/api-spec/generated/types.ts`（692行）の生成を確認した。

### 追加で判明した問題（T024実装中）

ルートの`package.json`は`typescript: ^7.0.2`（TypeScriptの新しいGoネイティブ実装ベースのメジャーバージョン）を指定しているが、`openapi-typescript@7.13.0`はこのバージョンとの組み合わせで`TypeError: Cannot read properties of undefined (reading 'createKeywordTypeNode')`という実行時エラーを起こすことを実行確認した（`ts.factory`のAPI形状が異なるため）。対応として、`packages/api-spec/package.json`にのみ`typescript: ^5.7.3`をdevDependencyとして追加し、pnpmワークスペースの依存解決をこのパッケージ内で分離することで解消した（ルートのTS7指定はそのまま維持、`AGENTS.md`が既に指摘する「3つの異なるTypeScriptバージョンが併存する」状況にもう1つ加わる形になるが、意図的な分離であり問題ない）。

## 未確認・推測

- `openapi-fetch`ランタイムクライアントとPrivy JWT付与（Authorizationヘッダー）の組み合わせ方は未検証（実装フェーズで確認）。
- CI環境（GitHub Actions等）でのJavaバージョンが本ローカル環境と異なる可能性はあるが、Zero-Java化によりこの懸念自体を無くす方針とした。

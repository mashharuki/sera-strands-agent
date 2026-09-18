# スパイクS4: Strands TS SDK + Amazon Bedrock疎通確認

**合格条件**: `research.md` §8 S4 — 最小構成のAgentがBedrock経由で応答を返し、ツール呼び出し（ダミーツール）が機能することを確認する。

**結果**: **未実施（ブロック中）— AWSアカウント認証情報が本セッションに存在しないため**。

## ブロック理由

このセッションには、Amazon Bedrockを実際に呼び出すためのAWSアカウント認証情報（アクセスキー、またはSSO/IAMロール）が設定されていない（`aws-mcp`プラグインも接続失敗が確認されている）。Bedrockの呼び出しは実際に課金が発生する操作であり、また認証情報をチャットに貼り付けさせることは安全上の理由から行わない。

## 実施済みの代替検証（コードレベル）

- 依存パッケージ`@strands-agents/sdk`（1.18.0）を`apps/backend/package.json`に追加済み（T002）。
- `apps/backend/src/agent/strands-client.ts`（T020実装時）は、`BedrockModel`のモデルID・リージョンを環境変数化する形で実装し、実際の呼び出しはAWS認証情報が用意された環境（開発者のローカルまたはCI/CD）で行う設計とする。

## 次のアクション（ユーザー側での対応が必要）

1. AWSアカウントで`ap-northeast-1`リージョンのBedrockモデルアクセスを有効化する（Claude Sonnet 4.6、または`jp.anthropic.claude-sonnet-4-6`推論プロファイル）。
2. ローカル開発環境またはCI/CDにAWS認証情報（IAMロール推奨、アクセスキーのハードコード禁止）を設定する。
3. 上記が整い次第、`apps/backend/src/agent/strands-client.ts`実装後に、本スパイクの検証（最小Agent+ダミーツール呼び出し）を実施し、本ファイルに結果を追記する。

**注記**: `research.md` §3で確認したStrands TS SDKの公式ドキュメント記述（Bedrockが既定プロバイダー、Claude Sonnet 4.6が既定モデル）は、実際のライブ呼び出しではなく公式ドキュメント確認によるものであり、本スパイクの合格条件（実際の疎通）とは別物である点に留意。

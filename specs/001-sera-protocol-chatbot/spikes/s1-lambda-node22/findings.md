# スパイクS1: AWS Lambda Node.js 22.xランタイム提供状況

**合格条件**: `research.md` §8 S1 — 公式ドキュメントで`nodejs22.x`ランタイムの存在を確認する。

**結果**: **合格（確認済み）**

AWS公式ドキュメント（`docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html`、閲覧日2026-09-18）の「Supported runtimes」表より:

| Name | Identifier | OS | Deprecation date |
|---|---|---|---|
| Node.js 22 | `nodejs22.x` | Amazon Linux 2023 | Apr 30, 2027 |

`nodejs22.x`は現行のサポート対象ランタイムであり、非推奨リストには含まれていない。`plan.md`のTechnical Contextが目標とする「Node.js 22.x」は採用可能と確認できた。

**追加確認事項**:
- `nodejs20.x`は既に非推奨（Deprecation date: Apr 30, 2026）となっており、22.x以降を選ぶ判断は妥当。
- `nodejs24.x`（Deprecation: Apr 30, 2028）も現行サポート対象。`@strands-agents/sdk`の要件（Node.js 22+）は満たすため22.xのままで問題ないが、より長いサポート期間を優先する場合は24.xも選択肢になりうる（`plan.md`は22.xのままとし、将来の判断材料としてのみ記録）。
- `nodejs26.x`はパブリックプレビューのため本番利用は非推奨。

**次のアクション**: `apps/cdk/lib/backend-stack.ts`（T013実装時）でLambda関数の`runtime`に`lambda.Runtime.NODEJS_22_X`を指定する。

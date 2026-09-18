# スパイクS6: sera-mcp(v1) dry-run/テストモードの有無

**合格条件**: `research.md` §8 S6 — ソースコードを直接確認し、dry-run/テストモードの有無を記録する。

**結果**: **合格（確認済み、存在する）**

`sera-cx/sera-mcp`（v1, commit `d6f50c1aa6098354d796b777a5474989e9acc1f7`）の`src/config.ts`を実コード確認。

- `POLICY_DRY_RUN`環境変数（既定値`false`）が`PolicyConfig.dryRun`として`PolicyEngine`に渡される。これがdry-runモードの実体。
- 想定より豊富な**ポリシー/ガードレール層**が既に存在することも判明（当初のresearch.mdでは未言及）:
  - `POLICY_PRESET`（`standard` / `sg-retail` / `starter` / `open`）によるプリセット切替
  - `maxNotionalUsd` / `dailyVolumeCapUsd`（1回あたり・日次の上限USD）
  - `allowedSymbols` / `allowedRecipients`（許可トークン・許可送金先のアローリスト）
  - `defaultExpirationSeconds` / `maxExpirationSeconds`（見積もり有効期限の既定値・上限、120秒〜600秒）
  - `outputToleranceBps`（スリッページ許容の下限緩和、最大500bps=5%にハードキャップ）
  - `SERA_ENABLE_EXECUTION_TOOLS=false`で`execute_swap`/`convert_and_send`ツール自体をMCPホストへ登録しない設定も可能（「マルチテナント配信では実行系を別の認可済み面に出すべき」という設計コメントあり）

**設計への示唆（未確認事項の追加、research.mdへの反映が必要）**:
- 開発・自動テストでは`POLICY_DRY_RUN=true`を第一候補とする（`docs/memo.md` §6の要求に合致）。
- `allowedRecipients`/`maxNotionalUsd`等のポリシー層は、アプリ側（DynamoDBの`ApprovalRequest`）とは別レイヤーの多層防御として活用できる可能性がある。ただし本プロジェクトのMVPスコープでは、アプリ側の承認フロー（FR-008〜FR-012）を主たる防御線とし、sera-mcp側のポリシー層は追加の技術検証（実装フェーズで`POLICY_PRESET`等の具体的な設定値を確定）とする。
- `defaultExpirationSeconds`（120秒）は、`Quote.expiresAt`のTTL設計（`data-model.md`）の既定値の参考になる。

**次のアクション**: `apps/backend/src/agent/sera-mcp-client.ts`（T018実装時）で、開発/CI環境は`SERA_NETWORK=sepolia`かつ`POLICY_DRY_RUN=true`を既定とする環境変数プリセットを用意する。

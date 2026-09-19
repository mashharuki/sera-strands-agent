# クイックスタート検証ガイド: Sera Protocol AIチャットボット

**目的**: 実装完了後に、本フィーチャーがspec.mdの各ユーザーストーリーを満たすことを手動で検証するための手順書。実装コード自体は本ドキュメントに含めない（[data-model.md](./data-model.md)・[contracts/](./contracts/)を参照）。

**前提**: 本ガイドは`/speckit-tasks`以降で実装が完了した後に使用する。本ターン（`/speckit-plan`）時点ではコマンド・スタックは未デプロイである。

## 前提条件

- Node.js 22.x（[research.md](./research.md) §7・S1で確定次第、正式なバージョンを明記する）
- pnpm（`packageManager`で指定されたバージョン）
- AWSアカウント（Bedrockで使うモデル（既定: Amazon Nova 2 Lite、`jp.amazon.nova-2-lite-v1:0`）が`ap-northeast-1`で利用可能であること）
- Privyアプリ（開発用App ID / Secret、Ethereum Sepoliaのembedded wallet作成を許可した設定）
- Ethereum SepoliaのRPCエンドポイント（テスト用）
- テスト用アカウントに配布するSepolia ETH（faucet等でユーザー自身が事前取得。spec.md Assumptions・FR-020参照。本アプリはガス代を肩代わりしない）

## セットアップ

```bash
pnpm install
pnpm --filter cdk cdk -- bootstrap   # 初回のみ（AWS認証情報が設定済みであること）
```

環境変数（`.env`相当、詳細な一覧は実装フェーズでREADMEに記載）:
- Privy App ID / Secret
- Sera MCP関連の接続設定（`sera-mcp`の署名モードは`external`を使用、[research.md](./research.md) §1.2）
- Bedrockのモデル/リージョン設定（`jp.amazon.nova-2-lite-v1:0`等）

## デプロイ（開発ステージ）

```bash
pnpm deploy -- --stage dev
```

完了後、コンソールにフロントエンドURL（CloudFront）とAPIエンドポイントが表示される想定（正式なコマンド実装は`/speckit-tasks`で行う）。

## 検証シナリオ（ユーザーストーリー対応）

各シナリオは[spec.md](./spec.md)の該当User Storyの受け入れ基準を満たすことを確認する。

### シナリオ1: ウォレット作成（US1）

1. デプロイされたフロントエンドURLを開き、Privyでログインする。
2. チャットに「ウォレットを作成して」と入力する。
3. **期待結果**: ウォレットアドレスが提示される（[contracts/openapi.yaml](./contracts/openapi.yaml) `POST /wallet` が201を返す）。
4. 再度同じ依頼を送る。
5. **期待結果**: 新規作成されず、既存ウォレット情報が提示される（`POST /wallet`が200を返す、FR-002）。

### シナリオ2: 残高確認（US2）

1. シナリオ1で作成したウォレットに、faucet等でSepolia ETHおよびテスト対象のstablecoinを入金しておく。
2. チャットで「残高を確認して」と依頼する。
3. **期待結果**: 保有トークンと数量が提示される（`GET /wallet/balance`、FR-003）。

### シナリオ3: 板・価格・取引履歴の照会（US3）

1. チャットで「USDC/USDTの価格を教えて」のように尋ねる。
2. **期待結果**: 見積もり（有効期限付き）が提示され、板情報や履歴と混同されない（`GET /market/quote`）。
3. チャットで板情報を尋ねる。
4. **期待結果**: 「参考値・合成データ」であることが分かる形で提示される（`GET /market/orderbook`、`isSynthetic: true`、[research.md](./research.md) §1.3）。

### シナリオ4: swap実行（US4）

1. チャットで「USDCをUSDTに10だけswapしたい」のように依頼する。
2. **期待結果**: ネットワーク・トークン・数量・手数料・スリッページを含む確認内容が提示される（`POST /transactions/swap/prepare`、FR-008）。
3. チャットで承認し、続けてPrivyのウォレットUIで署名する。
4. **期待結果**: `POST /transactions/swap/confirm`が202を返し、その後`GET /transactions/{id}`で`chainState`が`broadcast_pending`→`confirmed_success`（または`confirmed_failed`）へ遷移する（FR-013、US6）。
5. 同じ承認内容で確認・署名操作を誤って2回行う。
6. **期待結果**: 実際に実行されるのは1回のみ（FR-012、SC-005）。

### シナリオ5: 送金実行（US5）

1. チャットで「このアドレスに1 USDC送って」のように依頼する（送金先アドレスを指定）。
2. シナリオ4と同様に確認→承認→署名→実行の流れを確認する。
3. 署名を拒否するケースも確認する。
4. **期待結果**: 送金は実行されず、拒否された旨がチャットで提示される（FR-016）。

### シナリオ6: 実行結果・状態の後追い確認（US6）

1. シナリオ4またはシナリオ5の実行から一定時間後、チャットで「さっきのswapどうなった?」のように尋ねる。
2. **期待結果**: `GET /transactions`または`GET /transactions/{id}`の最新`chainState`に基づいた回答が返る（LLMの文章のみに基づかない、FR-013・SC-006）。

## 異常系の確認

- 残高不足・ガス代不足でのswap/送金依頼 → 理由が明確に提示されること（FR-016、FR-020のfaucet案内含む）。
- Sera側API障害を模擬 → 成功したかのように誤って提示しないこと（FR-017）。
- 未ログイン状態での各操作依頼 → 認証を促す案内が返ること（FR-019）。

## クリーンアップ

```bash
pnpm destroy -- --stage dev
```

削除対象範囲・残存リソース（オンチェーンのウォレット/取引履歴は削除不可）は、実装フェーズでREADMEに明記する（`docs/memo.md` §8）。

# AWS CDKで構築する、フルサーバーレスなSera AI Agent（ドラフト）

> **ドラフトの状態について**
> 本稿は実装と調査の記録から起こした原稿です。**AWSへのデプロイ、Bedrock（Amazon Nova）/ Privy / Sera との実接続、ブラウザ E2E は未実施**のため、実行結果・スクリーンショット・計測値・料金は載せていません。該当箇所は `TODO(実測)` としてあります。実測後に差し替え、それまで公開しないでください（憲章 原則VII）。
> 「確認済み」と書いてあるのは、ユニットテスト・型チェック・`cdk synth`・ソース読解で確認できたものだけです。

## 0. この記事で作るもの

Ethereum Sepolia 上の Sera Protocol を、チャットの自然言語で操作するボットです。

- ウォレット作成、残高確認、板・見積・履歴の取得、ステーブルコイン swap、送金、取引状態の確認
- AWS CDK でフルサーバーレス（Lambda / API Gateway / DynamoDB / S3 / CloudFront / Secrets Manager）
- エージェントは Strands Agents（TypeScript SDK）+ Bedrock（Amazon Nova 2 Lite。AWSクレジットで賄うため。§4）、Sera との接続は sera-mcp

想定読者は TypeScript と React は分かるが、CDK・AI エージェント・MCP・Sera は初めての方です。

![アーキテクチャ図](../architecture/architecture.svg)

## 1. なぜこの構成か

| 判断 | 理由 |
| --- | --- |
| `/chat` は Lambda Function URL のレスポンスストリーミング | API Gateway は 29 秒で切れる。LLM の応答は超えうるため |
| それ以外は API Gateway + Lambda（Hono） | 短時間で終わる読み取り/実行系。OpenAPI と相性が良い |
| DynamoDB 単一テーブル + TTL | 会話・見積・承認・取引・冪等キーを 1 つで扱う。見積/承認は期限で自動削除 |
| 非カストディアル（署名はユーザー） | 資産変更をサーバーの鍵で行わないため。Privy の埋め込みウォレットで署名 |
| OpenAPI 先行 | 契約を正本にして、型を生成する（Java 製ジェネレータではなく `openapi-typescript`。§7） |

## 2. 「読み取り」と「資産変更」を分ける

swap・送金は次の順でしか進みません。

1. エージェントが見積/送信内容を作る（**ここではまだ何も送らない**）
2. 確認画面にネットワーク・トークン・数量・宛先・手数料・有効期限を表示
3. ユーザーがチャットで承認
4. ユーザー自身のウォレットが署名
5. バックエンドが検証して送信

成否は **LLM の文章ではなく、Sera の決済状態 / オンチェーンのレシートから更新**します。照会に失敗したときは成功にせず、古い状態に `statusCheckError` を付けて返します。

### 二重実行の防止

承認IDに対する冪等キーを DynamoDB の条件付き書き込みで取ります。

- 最初の実装は「承認の時点で冪等キーを取る」もので、**送信前に失敗すると承認IDが永久にロックされる**欠陥がありました。
- 現在は **ブロードキャストの直前に取得し、送信前の失敗なら解放**します。

> こういう欠陥はテストを書く過程で見つかりました。コード: `apps/backend/src/store/idempotency.ts`、テスト: `apps/backend/test/routes/transactions.*.test.ts`

### 送金は署名済みトランザクションを検証してから送る

sera-mcp の `send_transfer` は受け取った raw トランザクションを**検証しません**（ソース確認）。そこでバックエンド側で viem を使い、トークンコントラクト・宛先・数量・署名者が承認内容と一致することを確認してから送ります（`apps/backend/src/agent/tx-verify.ts`、ユニットテスト 6 件）。

## 3. 既存のSeraコードをどう再利用したか

これが一番の詰まりどころでした。

### 3.1 sera-mcp は npm に無い

`npm install sera-mcp` はできません。最初、私は「依存に入れた」つもりで実装を進めており、実際には取り込めていないことに途中で気づきました。

対応:

- `vendor/sera-mcp` に **git submodule として固定コミット（`d6f50c1`）** で取り込む
- `scripts/build-sera-mcp.mjs` で、固定コミットの一致を確認 → ビルド → esbuild で単一ファイル化
- ネイティブ依存の `better-sqlite3` は、履歴DB用（`SERA_HISTORY_DB` 未設定なら使われない）で、Lambda(Linux) には mac で作ったバイナリを持ち込めない。そこで「呼ばれたら明示的に失敗するスタブ」に差し替えてバンドル
- CDK の `commandHooks.afterBundling` で Lambda のコード直下に同梱し、子プロセスとして起動（`127.0.0.1` のループバックのみ）

`cdk synth` で、2 つの Lambda のアセットに `sera-mcp.mjs` が入ることは確認しました。Lambda 上での起動は実測で確認できました（`sera-mcp ready`、55 ツール、ネットワーク sepolia、署名モード external）。ただし最初のデプロイでは、ESM バンドル内の CJS 依存が `Dynamic require of "child_process" is not supported` で起動時に落ちました。`banner` で `createRequire` を注入して解消し、その間 API Gateway が CORS ヘッダーなしの 502 を返すため、症状は「CORS エラー」に見えました（原因はログでしか分かりません）。

### 3.2 v2 が出ていたが v1 を選んだ

sera-mcp-v2 も確認しましたが、次の理由で v1 のまま進めました（`specs/001-sera-protocol-chatbot/research.md` §9）。

- サーバーが鍵を保持する前提で、本アプリの非カストディアル方針に合わない
- トランスポートが stdio のみ
- LICENSE が無い

### 3.3 ツール名・引数は自分の想像と違った

計画段階の想定と、実際のソースには差がありました。たとえば、ツール名はすべて `sera.` 接頭辞付き（`sera.get_quote` など）、見積の取得には `owner_address` が必須、swap の実行は `uuid` と `signature` を渡す、といった点です。フェーズ4〜6 を想定のまま実装した結果、ツール名や引数の扱いを直す必要が出ました。

対策として、呼び出しを `apps/backend/src/agent/sera-tools.ts` に**集約**しました。ハードコードしていたテストが期待どおり失敗し、直しました（差分の表: `research.md` §9-B）。

> 教訓: 外部ツールの契約は、ドキュメントの記憶ではなく **ソースから確認**し、呼び出し口を 1 箇所にまとめる。

### 3.4 まだ実機で確認できていないSera側の形

`get_coin_metadata` の応答、`fee_breakdown`、`expires_at`、トランザクションのフィールド名、`eip712_domain`、決済状態の語彙は、**ソース読解ベースの想定**です。`TODO(実測)`

## 4. Strands Agents で詰まったところ

- ストリームのイベント形式: 最初は `modelContentBlockDeltaEvent` をトップレベルで受ける想定でしたが、実際は `modelStreamUpdateEvent` の中の `event.event` に入っています（インストールした型定義で確認し修正）。
- ツールは `tool({ name, description, inputSchema(zod), callback })`、モデルは `@strands-agents/sdk/models/bedrock` の `BedrockModel`。

### モデルは Amazon Nova 2 Lite

当初は Claude Sonnet 4.6 を想定していましたが、AWSクレジットを使う前提で **Nova 2 Lite** に変更しました（`jp.amazon.nova-2-lite-v1:0`、東京向けジオ推論プロファイル。IDはAWS公式のモデルカードで確認）。モデルIDは環境変数 `BEDROCK_MODEL_ID` で差し替えられます。

- 変更時に、CDK に **Bedrock の実行権限（`bedrock:InvokeModel*`）が抜けていた**ことに気づき、追加しました（CDKテストで確認）。
- Nova 2 Lite のツール呼び出し精度・日本語品質は未検証です。資産変更は承認と署名で守っているため、誤ったツール呼び出しがあっても勝手には実行されませんが、応答品質は `TODO(実測)`。

Bedrock を実際に呼んでの動作確認（スパイク S4）は未実施です。`TODO(実測)`

## 5. Privy

- サーバー側は `@privy-io/server-auth` が非推奨で、`@privy-io/node` の `verifyAccessToken`（`access_token` / `app_id` / `verification_key`）を使います。AI 要約された API 説明が間違っていたため、**インストールした型定義**で確認しました。
- クライアント側は `useCreateWallet` / `useSignTypedData` / `useSignTransaction`。

署名まで含めた実機確認（スパイク S5）は未実施です。`TODO(実測)`

## 6. 資格情報をどう扱うか

Sera の運用者資格情報は、コード・テンプレート・チャットのどこにも置きません。

CDK でスタック内に **空のプレースホルダー**の Secret を作り、値はデプロイ後に利用者が設定します。

```ts
const seraSecret = new secretsmanager.Secret(this, "SeraCredentials", {
  secretObjectValue: {
    apiKey: cdk.SecretValue.unsafePlainText(""),
    apiSecret: cdk.SecretValue.unsafePlainText(""),
  },
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

- 値がテンプレートに入らないので、再デプロイしても設定済みの値は上書きされません。
- スタックの管理下にあるため、destroy で一緒に消えます。
- 名前は固定しません（削除後の復旧期間中は同名で再作成できないため）。

バックエンドは初回の sera-mcp 起動時に読み出し、子プロセスの環境変数としてだけ渡します。

```ts
export function parseSeraSecret(secretString: string | undefined): LoadResult {
  if (!secretString) return { ok: false, reason: "not-configured" };
  // ... JSON を検証。空のプレースホルダーは "not-configured"、形式不正は "invalid"
}
```

- 空のままなら「未設定」として警告を出し、資格情報が必要なツールだけが失敗します。
- 形式が不正なら例外にして、設定ミスを黙って通しません。
- ユニットテスト 8 件（`apps/backend/test/agent/sera-auth.test.ts`）。実際の Secrets Manager での動作は未検証です。

CDK のアサーションテストで「テンプレートに `SERA_API_KEY` 等が含まれない」ことを確認しています（`apps/cdk/test/cdk.test.ts`）。

## 7. ツール周りで踏んだ落とし穴

| 症状 | 原因と対処 |
| --- | --- |
| OpenAPI Generator CLI が `UnsupportedClassVersionError` | Java 8 環境。Java を上げる代わりに `openapi-typescript` + `openapi-fetch` へ変更 |
| `openapi-typescript` が `ts.factory` undefined で落ちる | ルートの TypeScript 7 が原因。api-spec だけ `typescript ^5.7.3` に固定 |
| `pnpm run` がネイティブビルドの無視で失敗 | `pnpm-workspace.yaml` の `allowBuilds` を設定 |
| `aws-cdk@2.270.0` が存在しない | CLI と `aws-cdk-lib` はバージョン体系が別。CLI は 2.1142.0、ライブラリは 2.270.0 |
| `npx cdk` が何も出さない | 別のバイナリに解決される。`apps/cdk/node_modules/.bin/cdk` を使う |
| CDK の jest で古いスタックが読まれる | `lib/` に残った tsc の出力 `*.js` が `.ts` より優先された。`moduleFileExtensions` で `ts` を先頭に |

## 8. テストで守ったこと

- backend 41 件（vitest）: 送金検証、決済状態のマッピング、冪等、承認フロー、資格情報ローダーなど
- CDK 8 件（jest）: Function URL が `RESPONSE_STREAM`、Secret が空プレースホルダー + 削除ポリシー、平文の資格情報がテンプレートにない、など
- 決済状態のマッピングでは、`unsuccessful` を成功と誤判定するバグがテストで見つかりました（否定語を先に判定するよう修正）。

## 9. 再現手順・削除

README を参照してください。デプロイは `pnpm stack:deploy -- --stage <stage>`、削除は `pnpm stack:destroy -- --stage <stage>` です（実行はまだ検証していません）。

## 10. 料金

`TODO(実測)` — 構成要素（Lambda / API Gateway / DynamoDB / S3 / CloudFront / Secrets Manager / Bedrock のトークン従量）は README にありますが、金額は実測後に記載します。

## 11. 実測後に埋めるもの（チェックリスト）

- [ ] デプロイ〜動作確認〜削除の実行ログ
- [ ] チャットの画面キャプチャ（残高、見積、確認画面、署名、取引状態）
- [ ] SC-001: ウォレット作成〜残高確認の所要時間
- [ ] SC-002: 板/見積/履歴照会が追加確認なしで回答された割合
- [ ] Bedrock のレイテンシ・ストリーミングの体感
- [ ] Sera の実レスポンス（§3.4）と、想定との差分
- [ ] 月額料金の概算（前提を明記）

## 12. まとめ（暫定）

- 資産変更は「承認 + ユーザー署名 + サーバー側検証」の三重にし、成否は検証済みの結果だけから決める。
- 外部ツールの契約はソースで確認し、呼び出し口を集約する。
- 秘密情報はテンプレートに入れず、空の Secret + 実行時読み出しにする。
- 実環境での確認が済むまでは、「動く」と書かない。

## 参照

- [sera-cx/sera-mcp](https://github.com/sera-cx/sera-mcp)（MIT、固定コミット `d6f50c1`）
- Strands Agents TypeScript SDK、Hono、Privy、AWS CDK
- 調査・設計の詳細: `specs/001-sera-protocol-chatbot/`

## 付録: デプロイして初めて分かったこと（実測）

- **CORS エラーの正体は Lambda の起動失敗**だった（上記 3.1）。API Gateway の 502 にはCORSヘッダーが付かない。
- **Privy の「Verification key」と「App Secret」の取り違え**。`PRIVY_VERIFICATION_KEY` に App Secret を入れると全 API が 401 になる。App Secret は秘密なので、環境変数に入れてしまうと Lambda の設定や CloudFormation に平文で残る。コードで PEM 公開鍵かどうかを検査し、誤設定なら明示的に失敗させるようにした。
- **エラーの握りつぶし**。原因をログに出さず 401/502 だけ返す作りだと、切り分けに時間がかかった。失敗の種別とツール名をログに残すようにした。フロントエンドも、エラーイベントを表示しないと「何も返ってこない」ように見える。
- **Sera の `/balances` は認証必須**。認証なしで 401 を確認（sera-mcp のソースでも `auth: true`）。swap の見積・実行や市場情報は認証不要。残高は viem でオンチェーンから読む方式に変更した（Vault 内残高は対象外）。
- **送金・状態確認もオンチェーンへ**。`build_transfer`/`send_transfer` も認証必須だったため、ERC-20 の `transfer` を viem で組み立て（nonce・ガス・手数料はRPCから取得、ガスに20%の余裕）、ユーザーが Privy で署名した raw tx を検証してから RPC へ送る方式にした。ステータスはレシートで判定。一方 **swap の決済状態には公開APIが無く**、キー無しでは確定できない（推測で成功にはしない）。この構成は実機での送金・署名は未検証 `TODO(実測)`。

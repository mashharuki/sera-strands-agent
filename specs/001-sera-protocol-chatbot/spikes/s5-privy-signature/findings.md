# スパイクS5: Privy embedded walletの署名とsera-mcpの署名形式の適合確認

**合格条件**: `research.md` §8 S5 — Sepoliaテストネット上でPrivyのサンプルウォレットにより署名を生成し、sera-mcpのツールに受理される形式であることを確認する。

**結果**: **未実施（ブロック中）— Privyアプリの認証情報が本セッションに存在しないため**。

## ブロック理由

Privy embedded walletの作成・署名にはPrivyのApp ID/Secret（開発者アカウントでの登録）が必要であり、本セッションには設定されていない。ウォレット作成・署名は資産操作に直結するため、認証情報をチャットに貼り付けさせることは行わない。

## 実施済みの代替検証（コードレベル）

- `sera-mcp`(v1)のソースコード確認（`research.md` §1.3、本ターンのスパイクS3）により、`execute_swap`が`{uuid, signature}`というEIP-712署名を受け取る形式であることを実コードで確認済み。Privyのクライアント側embedded walletが標準的なEIP-712署名（`eth_signTypedData_v4`相当）を生成できれば、形式面での適合性は高いと推測される（ただし実地検証はしていない）。
- `buildTransfer`/`sendTransfer`（送金）は未署名EIP-1559トランザクションを生成し、標準的な`eth_signTransaction`相当の署名を期待する設計であることも確認済み。Privyのembedded walletは標準的なEVM署名インターフェースを提供するため、こちらも形式面での適合性は高いと推測されるが未検証。

## 次のアクション（ユーザー側での対応が必要）

1. Privy開発者アカウントでアプリを作成し、Ethereum Sepoliaのembedded wallet作成を有効化する。
2. テスト用アカウントでembedded walletを作成し、Sepolia ETH・テスト対象stablecoinをfaucet等で入手する。
3. 上記が整い次第、`apps/frontend/src/features/transactions/signAndConfirm.ts`実装時に、実際にPrivyで生成した署名がsera-mcpの`execute_swap`/`sendTransfer`に受理されるかをSepolia上で確認し、本ファイルに結果を追記する（**ブロードキャストは伴わない検証、または少額のdry-run実行に限定する**）。

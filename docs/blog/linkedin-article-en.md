<!--
LinkedIn Article 用の原稿。
LinkedIn の記事エディタは Markdown をそのまま解釈しないため、貼り付け後に
以下の変換をご自身で行ってください:
- `##` の行 → 見出し(H2)ボタンを適用
- `**太字**` → 選択してBoldボタン
- `- ` の箇条書き → そのまま貼ればリスト化されることが多いが、崩れたら
  エディタのリストボタンで付け直す
- コードのような等幅表記（`fetch()` 等）→ 太字や斜体で代用。LinkedIn記事
  にコードブロックはない
- カバー画像: docs/blog/thumbnail.png
- 本文中の画像挿入位置は [IMAGE: ...] で示した。該当ファイルをその場所に
  アップロードする
-->

# Title
Chat Your Way Through a DeFi Protocol — Building a Non-Custodial AI Agent on Fully Serverless AWS

## Subtitle
What I actually hit — and fixed — building a Strands Agents + Bedrock chatbot for Sera Protocol on Ethereum Sepolia

[IMAGE: docs/blog/thumbnail.png — cover image]

I wanted to see how far I could push "chat with your wallet" as an actual product shape: no backend holding your keys, no LLM output trusted as ground truth for money movement, and no server-side credential that quietly works for everyone. Here's what building that on Sera Protocol (an Ethereum Sepolia stablecoin/DEX protocol) taught me.

## What it does

A chat interface where you can:
- Create an embedded wallet (via Privy)
- Check balances
- Pull orderbook/quote/trade-history data
- Swap stablecoins
- Transfer tokens
- Check the real status of a transaction

Stack: AWS CDK (Lambda, API Gateway, DynamoDB, S3, CloudFront, Secrets Manager) + Strands Agents (TypeScript SDK) + Amazon Bedrock (Nova) + Hono + React/Privy, talking to Sera through **sera-mcp**.

## Design decision #1: separate "read" from "state-changing," and never trust the model's word

Swaps and transfers only ever happen in this order:

1. The agent prepares a quote / unsigned transaction — nothing is sent yet
2. A confirmation screen shows network, token, amount, destination, fee, and expiry
3. The user approves in chat
4. The user's own wallet signs
5. The backend verifies the signature and broadcasts

Success or failure is decided from **Sera's settlement status or the on-chain receipt — never from the LLM's text.** If a status check fails, the app returns the last known state plus an explicit "couldn't verify, might be stale" flag rather than guessing.

Two bugs I found the hard way here:
- **Idempotency lock bug:** the first version claimed the idempotency key at approval time. If broadcasting then failed, the approval ID was locked forever. Fixed by claiming the key immediately before broadcast and releasing it on any pre-broadcast failure.
- **Transfers aren't self-verifying:** sera-mcp's `send_transfer` does not validate the raw transaction it's handed. So the backend independently checks — with viem — that the token contract, recipient, amount, and signer all match what the user actually approved, before it ever reaches the network.

## Design decision #2: reusing someone else's protocol code is its own project

This was the actual time sink.

**sera-mcp isn't on npm.** It's pulled in as a git submodule pinned to a specific commit, verified against that pin, then bundled into a single file with esbuild for Lambda. Its native SQLite dependency (only used for local trade history, which I don't enable) gets swapped for a stub that fails loudly if anything ever calls it — you can't ship a macOS-built native binary into a Linux Lambda.

**A v2 of sera-mcp exists. I didn't use it** — it assumes the server holds the private key, which is the opposite of the non-custodial design here, plus it's stdio-only and has no license.

**The tool contract didn't match what I'd assumed going in.** Tool names all carry a `sera.` prefix, quotes require an `owner_address`, swap execution wants a `uuid` + `signature`, and so on. I ended up funneling every call to Sera through one module so the mismatch only had to be fixed in one place instead of scattered across the codebase. Lesson: verify an external tool's contract from its actual source, not from memory or docs, and centralize the call site.

**API keys turned out to be wallet-scoped, not account-scoped.** You mint a Sera API key by having a wallet sign an EIP-712 message — each key is tied to that one wallet, capped at 10 per wallet. A single server-side operator key can't act on behalf of every user's wallet. Rather than build a whole per-user-key-issuance-and-storage system, I designed around it: balances are read straight from-chain, transfers are built and verified with viem, and swap settlement is confirmed by watching for the matching pair of on-chain Transfer events (input token leaving the wallet, output token arriving at the destination) instead of calling Sera's authenticated status endpoint.

## Strands Agents + Bedrock

Two concrete gotchas:
- The streaming event shape wasn't what I expected from the docs — the actual delta lives inside `event.event` of a `modelStreamUpdateEvent`, not at the top level. Caught this by checking the installed type definitions, not the docs.
- Model choice ended up being Amazon **Nova 2 Lite** rather than a Claude model, specifically to run on AWS credits. That meant adding a Bedrock invoke permission to the CDK stack that had been missing entirely — caught by a CDK assertion test, not by manual review.

And a genuinely interesting agent-design bug: with three balance tokens hardcoded as examples in a tool description, the model concluded — and stated as fact — that those were the *only* tokens Sera supported. In reality the registry had about 150. The fix wasn't a bigger prompt, it was giving the tool itself a way to report what it actually checked (count of tokens queried, zero balances omitted), so the model had grounded data instead of an implicit assumption to fill in.

## Handling the operator credential without ever writing it down

The Sera credential — when configured at all — never appears in code, templates, or logs. CDK provisions the Secrets Manager secret with an **empty placeholder** at deploy time; you fill it in afterward with the AWS CLI, outside the deployment pipeline entirely. Redeploying never overwrites what you've set. A CDK assertion test checks the rendered CloudFormation template contains no plaintext key/secret. If the secret is left empty, the app treats it as "not configured" and only the operator-credential-requiring tools fail — everything else still works, which given the wallet-scoping problem above turned out to matter more than expected.

## Two fixes from an actual review pass, days after "it works"

Coming back to test it end-to-end surfaced two things static checks never would have:

- **A failed swap said "swap execution failed." That's it.** The real reason — insufficient balance — was computed on the server and then discarded before it reached the UI. A one-line change to surface the server's actual error message turned a dead end into something a user can act on.
- **The market data panel was rendering raw JSON to end users.** Rebuilt it as an actual quote card, a color-coded bid/ask table, and a readable trade-history list — same API responses, but now something a person would read instead of parse.

[IMAGE: docs/blog/linkedin-quote-screenshot.jpg — the rebuilt quote view]
[IMAGE: docs/blog/linkedin-orderbook-screenshot.jpg — the rebuilt orderbook view]

## It actually swapped

End to end, on Sepolia: a real USDT → USDC swap, approved in chat, signed by the embedded wallet, confirmed not by the model's reply but by the wallet's on-chain balance actually changing. That's the bar the whole non-custodial design was built to clear, and it cleared it.

## What carries over beyond this project

- Split read from state-changing, and gate the second one behind explicit approval **and** the user's own signature — never a server-held key.
- Verify external tool contracts from source, and give the model grounded data instead of letting it infer scope from examples.
- Never let a shared credential stand in for per-user authorization — check what a key is actually scoped to before you design around it.
- Decide success/failure from verified state (chain, protocol API), never from generated text.

This is a dev-stage project on a testnet, not production, but the design constraints don't loosen with scale — if anything they get less forgiving.

Code is open: https://github.com/mashharuki/sera-strands-agent

#AWS #AIAgents #Web3 #NonCustodial #BuildInPublic

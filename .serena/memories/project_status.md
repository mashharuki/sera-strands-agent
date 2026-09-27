# Project Status

Implemented end to end (backend agent/routes/store, 3 CDK stacks, frontend features, OpenAPI contract). Trust code over docs if they disagree; `README.md` `## 検証状況` is the verification ledger.

Verified in real env: AWS deploy, Privy login, sera-mcp startup on Lambda (55 tools, sepolia), MYRT swap with permit.
NOT verified: Bedrock (Nova) chat, real balance/quote/swap/transfer flows end to end, browser E2E, Sera secret loading on real AWS. Never report these as working.

## Sera API key/secret
- Optional operator creds in Secrets Manager (`SERA_SECRET_ID`, JSON `{"apiKey","apiSecret"}`), read by `apps/backend/src/agent/sera-auth.ts`, passed only to the sera-mcp child as `SERA_API_KEY/SECRET`. Unset → sera-mcp still starts; auth-required tools fail.
- Auth-required in sera-mcp: `/balances`, `/transfer`, settlement status. App deliberately avoids them: balances on-chain, transfers via viem + raw tx, swap settlement via on-chain Transfer logs.
- Keys are issued per wallet, so per-user keys may be needed if key-required tools are adopted. Never put keys in env files/code/logs.

## Invariants
Swap/transfer need chat approval + user wallet signature; success derives only from verified on-chain/Sera results; idempotency key before broadcast; OpenAPI generated types must match.

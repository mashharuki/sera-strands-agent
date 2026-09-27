# Project Status

Implemented end to end (backend agent/routes/store, 3 CDK stacks, frontend features, OpenAPI contract). Trust code over docs if they disagree; `README.md` `## 検証状況` is the verification ledger.

Verified in real env: AWS deploy, Privy login, sera-mcp startup on Lambda (55 tools, sepolia), MYRT swap with permit.
NOT verified: Bedrock (Nova) chat, real balance/quote/swap/transfer flows end to end, browser E2E, Sera secret loading on real AWS. Never report these as working.

## Sera API key/secret
- Keys are per wallet (wallet signs EIP-712 `ManageApiKey`; ≤10/wallet; secret shown once); `Authorization: Bearer key:secret`. Key-required: `/balances`, `/orders*`, `/fills*`, `/permit/metadata`, `/approve`, `/deposit`, `/tx/send`, `/transfer*`. Key-free: `/tokens`, `/markets`, `/config`, `POST /swap/quote`, `POST /swap`. Source: docs.testnet.sera.cx/api-reference/authentication/.
- Optional operator creds in Secrets Manager (`SERA_SECRET_ID`), read by `apps/backend/src/agent/sera-auth.ts`, passed only to the sera-mcp child as `SERA_API_KEY/SECRET`. Unset → sera-mcp starts; key-required tools fail.
- A single operator key likely covers only its own wallet, not other users' (unverified live). Per-user keys would need each user's wallet to sign `ManageApiKey` + secure storage (not implemented). App avoids key-required paths: balances on-chain, transfers via viem, settlement via on-chain Transfer logs. Never put keys in env files/code/logs.

## Invariants
Swap/transfer need chat approval + user wallet signature; success derives only from verified on-chain/Sera results; idempotency key before broadcast; OpenAPI generated types must match.

# AGENTS.md

This file provides guidance to AI Codeing Agent when working with code in this repository.

## ETH Skills

Read https://ethskills.com/SKILL.md and follow it before writing Solidity or shipping anything onchain.

## Project status

A **pnpm-workspace monorepo** for a fully-serverless AWS chatbot for **Sera Protocol** (wallet creation/balance, orderbook/quote/history, stablecoin swap, transfers, tx status via natural language; Ethereum Sepolia testnet only). Stack: AWS CDK + **Strands Agents** (TS SDK, Bedrock Amazon Nova) + Hono + React 19/Vite + Privy + `sera-mcp` (git submodule) + DynamoDB, with an OpenAPI-first contract. `README.md` is the source of truth for setup, env vars, and **verification status** (`## 検証状況`); `specs/001-sera-protocol-chatbot/` holds the Spec Kit artifacts (spec/plan/research/tasks); `docs/memo.md` is the original brief.

What exists (verified against the tree, not just docs):
- `apps/backend`: Hono app. `src/agent/` (Strands client, sera-mcp client, tools, on-chain balance/transfer/swap-evidence/permit verification), `src/routes/` (`/chat` NDJSON stream, `/wallet`, `/market`, `/transactions`), `src/store/` (DynamoDB single-table: conversations/quotes/approvals/transactions/idempotency), `src/auth/privy.ts`. vitest tests in `test/`.
- `apps/cdk`: `DataStack` (DynamoDB), `BackendStack` (API Gateway HTTP API + API Lambda, `/chat` Lambda Function URL with response streaming, Secrets Manager `SeraCredentials`), `FrontendStack` (S3 + CloudFront OAC).
- `apps/frontend`: React 19 + Vite + Privy + TanStack Query + zustand + `openapi-fetch`; features under `src/features/{chat,market,transactions,wallet}`; Playwright spec in `e2e/`.
- `packages/api-spec`: `openapi.yaml` (source of truth), generated types, Postman collection. `packages/shared`: shared types.
- `vendor/sera-mcp`: git submodule pinned to `d6f50c1` (v1; v2 deliberately not used, see `specs/.../research.md`). Clone with `--recurse-submodules`.

**Not everything is verified in a real environment.** Deploy, Privy login, and sera-mcp startup on Lambda are confirmed; Bedrock chat, real swap/transfer flows, and browser E2E are not (see README). Do not report unverified paths as working.

### Sera API key/secret
Per the official docs (https://docs.testnet.sera.cx/api-reference/authentication/, docs-confirmed): keys are **per wallet** (issued when that wallet signs an EIP-712 `ManageApiKey`; max 10 per wallet; secret shown once), sent as `Authorization: Bearer {api_key}:{api_secret}`. Key-required: `/balances`, `/orders*`, `/fills*`, `/permit/metadata`, `/approve`, `/deposit`, `/tx/send`, `/transfer`, `/transfer/send`. Key-free: `/tokens`, `/markets`, `/config`, `POST /swap/quote`, `POST /swap` (EIP-712 signature only).

Implementation: optional operator credentials, loaded from Secrets Manager (`SERA_SECRET_ID`, JSON `{"apiKey","apiSecret"}`) by `apps/backend/src/agent/sera-auth.ts` and passed to the sera-mcp child process only as `SERA_API_KEY`/`SERA_API_SECRET`. Unset → sera-mcp still starts; only key-required tools fail. Because keys are wallet-scoped, a single operator key most likely works only for its own wallet, not for other users' wallets (not verified on a live deploy). Multi-user use of key-required tools would need per-user keys signed by each user's wallet and stored safely (not implemented). The app therefore avoids key-required paths (balances on-chain, transfers via viem, swap settlement via on-chain Transfer logs). Never put the key in env files, code, or logs.

### Stale-doc caution
This file previously described the repo as an empty scaffold; that is no longer true. If README/specs and code disagree, trust the code and fix the doc.

## Commands

Package manager is **pnpm** (pinned to `11.24.0` via `packageManager`); Node 22+. Workspace globs: `apps/*`, `packages/*`.

### Root
```
pnpm format              # biome format --write .
pnpm check               # biome check --write .   (lint + format, fixes in place)
pnpm jscpd               # copy-paste detection over apps/ and packages/
pnpm knip                # unused files/exports/deps detection
pnpm build:sera-mcp      # bundle vendor/sera-mcp -> apps/backend/vendor-dist/sera-mcp.mjs (required before cdk test/deploy)
pnpm stack:deploy        # gen types -> bundle sera-mcp -> deploy Data/Backend -> build frontend with backend URLs -> deploy Frontend
pnpm stack:destroy       # tear down (scripts/stack.mjs; reads root .env)
```
Per-workspace proxies: `pnpm cdk|backend|frontend|api-spec|shared <args>` (forward via `pnpm --filter`). Note `pnpm deploy` collides with a pnpm builtin, hence `stack:*`.

### apps/backend
```
pnpm --filter backend test          # vitest run
pnpm --filter backend test -- <file-or-pattern>
```
Deployed via CDK (`NodejsFunction`), **not** by the `build`/`zip`/`update`/`deploy` scripts in its `package.json` — those are leftovers from the scaffold (`update` targets a Lambda named `hello`); don't use them.

### apps/cdk
```
pnpm --filter cdk test              # jest (CloudFormation assertions)
pnpm --filter cdk test -- -t "<name>"
pnpm --filter cdk build             # tsc
pnpm --filter cdk cdk -- synth | diff | deploy
```

### apps/frontend
```
pnpm --filter frontend dev
pnpm --filter frontend build        # tsc -b && vite build (typecheck + build)
pnpm --filter frontend lint         # oxlint (NOT biome)
pnpm --filter frontend test         # vitest run src
pnpm --filter frontend e2e          # playwright (not yet verified against a live deploy)
```

### packages/api-spec
```
pnpm --filter api-spec run generate         # openapi.yaml -> generated/types.ts
pnpm --filter api-spec run generate:check   # regenerate + git diff --exit-code (CI gate)
pnpm --filter api-spec run postman:generate
```
After editing `openapi.yaml`, run `generate` and commit the generated types.

### CI (`.github/workflows/ci.yml`)
Order: `api-spec generate:check` → `biome check .` → `frontend lint` → `backend test` → `build:sera-mcp` → `cdk test` → `frontend build`. Run the relevant subset locally before pushing.

### Linting/formatting scope
Biome (`biome.json`) runs repo-wide and excludes `.agents/`, `.claude`, `vendor`, `**/generated`, `**/vendor-dist`, `**/cdk.out`, `apps/frontend/public`. The frontend additionally uses `oxlint`. `packages/shared` and `packages/api-spec` `test` scripts are stubs (`exit 1`) — not a real gate.

### TypeScript versions
Pins differ per workspace (`apps/cdk` `~5.5.3`, `apps/frontend` `~6.0.2`, `packages/api-spec` `^5.7.3`, root `^7.0.2`); they are not unified. Don't assume one version applies repo-wide.

## Architecture

### Request flow
Browser (React + Privy, sends Privy JWT) → either **API Gateway HTTP API → API Lambda (Hono)** for `/wallet`, `/market`, `/transactions`, or **Lambda Function URL (RESPONSE_STREAM) → Chat Lambda (Hono + Strands Agent)** for `/chat` (NDJSON; avoids API Gateway's 29 s limit). The Chat Lambda calls Bedrock (Nova) and spawns `sera-mcp` as a 127.0.0.1 child process; state lives in a single DynamoDB table; Sera credentials in Secrets Manager. Frontend is served from S3 + CloudFront. Diagram: `docs/architecture/` (`build_diagram.py` regenerates it).

### Invariants (do not break)
- Read operations and state-changing operations are distinct. Swap/transfer need **chat approval + the user's own wallet signature** (non-custodial) after showing network/token/amount/destination/fees/expiry.
- Transaction success/failure comes from verified Sera/on-chain results, never LLM text. Failed status lookups return the stale state plus `statusCheckError`.
- Double-execution guard: DynamoDB conditional-write idempotency key taken right before broadcast, released on pre-broadcast failure.
- Signed transfer txs are verified with viem (token contract, recipient, amount, signer) before sending; permit signatures are verified to be the user's own before forwarding to Sera.
- The API contract is `packages/api-spec/openapi.yaml`; generated types must match (CI gate).

## Project rules (`.claude/rules/*.md`, mirrored in `.agents/rules/*.md`)

These are loaded automatically as project instructions, but the non-obvious operational ones worth knowing up front:

- **Spec Kit outputs** (`/speckit-*` commands, `.specify/` workflow artifacts) must be written in Japanese — see `.claude/rules/speckit-language.md` for the exceptions (code identifiers, error codes, protocol/standard names, feature-dir slugs, commit messages, source comments).
- **Browser automation**: prefer Chrome DevTools MCP against the dedicated `chrome-ai-agent` profile (`[::1]:9222`); don't repurpose the user's normal Chrome profile for remote debugging.
- **Evidence discipline**: state confidence (実コード確認/ドキュメント確認/主観/推測) for any blanket claim about the codebase, and `grep -rn` across the whole repo before asserting something doesn't exist anywhere.
- **Context hygiene**: don't dump large outputs (raw `git diff`, big grep results, long logs, multi-page PDFs) into the main conversation — delegate to a subagent and take back only a summary.
- **Subagent parallelism**: default to sequential subagent dispatch in this environment (heavy MCP tool definitions + large context + parallel launches reliably hit "Prompt is too long"); cap at 2-3 if parallel is unavoidable.
- **Git safety across concurrent sessions**: use `git -C <path>` instead of `cd` when scripting git across workspaces; avoid `git add -A`/`git add <dir>/` since other sessions may have uncommitted work in the same tree — stage explicit paths or use path-scoped commits instead.

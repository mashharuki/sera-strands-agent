# AGENTS.md

This file provides guidance to AI Codeing Agent when working with code in this repository.

## ETH Skills

Read https://ethskills.com/SKILL.md and follow it before writing Solidity or shipping anything onchain.

## Project status

This repo is currently a **pnpm-workspace monorepo scaffold**, not yet an implemented product. Per `docs/memo.md` (the design brief, in Japanese), the intended end state is a fully-serverless AWS chatbot for **Sera Protocol** (wallet creation/balance, orderbook/trade info, stablecoin swap, transfers via natural language) built with AWS CDK + **Strands Agents** (TS SDK) + Hono + React/Vite + Privy + `sera-mcp`/`sera-agents` + Ethereum Sepolia, with an OpenAPI-first API contract and a companion Japanese technical blog post as a deliverable.

As of now, **none of that feature set is implemented**:
- `apps/backend` is a stock Hono app with a single `"Hello Hono!"` route.
- `apps/cdk` is a stock, empty `CdkStack`.
- `apps/frontend` is a stock Vite + React 19 template.
- `packages/shared` and `packages/api-spec` have no source files.
- No Strands Agents, Privy, sera-mcp, sera-agents, zod, zustand, Tanstack, Turbo, vitest, or Playwright dependencies exist yet in any `package.json`, even though `docs/memo.md` names them as the target stack.

Do not assume any Sera/Strands/Privy integration exists — verify against current file contents before relying on it. When `docs/memo.md`'s brief is being executed, it explicitly calls for research/planning before implementation, deployment, or on-chain transactions in a first pass — check conversation/git history for whether a plan was produced before writing feature code.

## Commands

Package manager is **pnpm** (pinned to `11.24.0` via `packageManager`). Workspace globs: `apps/*`, `packages/*`.

### Root
```
pnpm format   # biome format --write .
pnpm check    # biome check --write .   (lint + format, fixes in place)
pnpm jscpd    # copy-paste detection over apps/ and packages/
pnpm knip     # unused files/exports/deps detection
```
Per-workspace proxies exist for convenience: `pnpm cdk <args>`, `pnpm backend <args>`, `pnpm frontend <args>`, `pnpm api-spec <args>`, `pnpm shared <args>` (each forwards to that workspace's own `package.json` scripts via `pnpm --filter`).

### apps/cdk (AWS CDK, TypeScript)
```
pnpm --filter cdk build          # tsc
pnpm --filter cdk watch          # tsc -w
pnpm --filter cdk test           # jest (all tests)
pnpm --filter cdk test -- -t "<name>"   # single test by name
pnpm --filter cdk cdk -- synth   # emit CloudFormation
pnpm --filter cdk cdk -- diff
pnpm --filter cdk cdk -- deploy
```

### apps/backend (Hono, deployed as a Lambda handler)
```
pnpm --filter backend build   # esbuild bundle -> dist/index.js (platform=node, target=node20)
pnpm --filter backend zip     # zip -j lambda.zip dist/index.js
pnpm --filter backend deploy  # build -> zip -> aws lambda update-function-code (function name: "hello")
```
Note: `deploy` assumes a Lambda function named `hello` already exists out-of-band; it is **not** currently wired through CDK.

### apps/frontend (Vite + React 19)
```
pnpm --filter frontend dev      # vite dev server
pnpm --filter frontend build    # tsc -b && vite build  (closest thing to a typecheck)
pnpm --filter frontend lint     # oxlint (NOT biome — frontend uses its own linter)
pnpm --filter frontend preview
```

### Linting/formatting scope
Biome (`biome.json`) runs repo-wide via `pnpm check`/`pnpm format` and excludes `.agents/`, `.kiro/settings/templates`, `**/.wrangler`, plus a couple of generated `.d.ts` paths that don't exist yet in this repo. The frontend has its own separate linter (`oxlint`), not covered by root Biome scripts.

### Testing
There is no root-level test runner yet. `apps/cdk` has Jest wired up (`apps/cdk/test/cdk.test.ts`). `packages/shared` and `packages/api-spec` currently have stub `test` scripts (`echo "Error: no test specified" && exit 1`) — treat as not implemented, not as a real gate. `apps/backend` and `apps/frontend` have no test scripts at all yet, despite vitest/Playwright being named as target tooling in `docs/memo.md`.

## Architecture

### Monorepo layout
```
apps/
  cdk/        AWS CDK infra (TypeScript) — currently an empty stack, will define API Gateway/Lambda/S3/CloudFront etc.
  backend/    Hono app, bundled with esbuild, intended to run as a Lambda handler (uses hono/aws-lambda's handle()).
  frontend/   Vite + React 19 SPA.
packages/
  shared/     Placeholder — intended for code shared between apps/backend and apps/frontend (e.g. types, API client).
  api-spec/   Placeholder — intended to hold the OpenAPI YAML contract and generated-client tooling per docs/memo.md.
```
Three different TypeScript version pins currently coexist across `apps/cdk` (`~5.5.3`), `apps/frontend` (`~6.0.2`), and the root (`^7.0.2`) — they are not yet unified; don't assume one TS version applies repo-wide.

### Intended request flow (per `docs/memo.md`, not yet built)
Frontend chat UI → API (Hono on Lambda, fronted by API Gateway) → Strands Agents orchestration → `sera-mcp`/`sera-agents` tool calls → Sera Protocol / chain state, with Privy handling user auth and wallet/signing. Read operations (balance, orderbook/quote lookups) and state-changing operations (swap, transfer) must be treated as distinct: state-changing actions require an explicit user-approved confirmation step showing network/token/amount/destination/fees before execution, and transaction success must be confirmed from actual tool/chain results, not from LLM text alone.

## Project rules (`.claude/rules/*.md`, mirrored in `.agents/rules/*.md`)

These are loaded automatically as project instructions, but the non-obvious operational ones worth knowing up front:

- **Spec Kit outputs** (`/speckit-*` commands, `.specify/` workflow artifacts) must be written in Japanese — see `.claude/rules/speckit-language.md` for the exceptions (code identifiers, error codes, protocol/standard names, feature-dir slugs, commit messages, source comments).
- **Browser automation**: prefer Chrome DevTools MCP against the dedicated `chrome-ai-agent` profile (`[::1]:9222`); don't repurpose the user's normal Chrome profile for remote debugging.
- **Evidence discipline**: state confidence (実コード確認/ドキュメント確認/主観/推測) for any blanket claim about the codebase, and `grep -rn` across the whole repo before asserting something doesn't exist anywhere.
- **Context hygiene**: don't dump large outputs (raw `git diff`, big grep results, long logs, multi-page PDFs) into the main conversation — delegate to a subagent and take back only a summary.
- **Subagent parallelism**: default to sequential subagent dispatch in this environment (heavy MCP tool definitions + large context + parallel launches reliably hit "Prompt is too long"); cap at 2-3 if parallel is unavoidable.
- **Git safety across concurrent sessions**: use `git -C <path>` instead of `cd` when scripting git across workspaces; avoid `git add -A`/`git add <dir>/` since other sessions may have uncommitted work in the same tree — stage explicit paths or use path-scoped commits instead.

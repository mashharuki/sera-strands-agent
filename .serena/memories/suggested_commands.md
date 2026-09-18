# Suggested Commands

## Root (via pnpm --filter passthrough)
- `pnpm format` — biome format --write .
- `pnpm check` — biome check --write . (lint+format fix)
- `pnpm jscpd` — copy-paste detection over apps/packages
- `pnpm knip` — unused files/exports/deps detection
- `pnpm cdk / backend / frontend / api-spec / shared` — proxies to that workspace's own scripts, e.g. `pnpm cdk build`, `pnpm frontend dev`.

## apps/cdk
- `pnpm --filter cdk build` — tsc
- `pnpm --filter cdk test` — jest
- `pnpm --filter cdk cdk -- <cdk-subcommand>` — e.g. deploy/synth/diff

## apps/backend
- `pnpm --filter backend build` — esbuild bundle to dist/index.js (node20 target)
- `pnpm --filter backend deploy` — build → zip → `aws lambda update-function-code` (assumes a Lambda function named `hello` already exists; not CDK-managed yet)

## apps/frontend
- `pnpm --filter frontend dev` — vite dev server
- `pnpm --filter frontend build` — tsc -b && vite build
- `pnpm --filter frontend lint` — oxlint (not biome)

## Darwin-specific notes
- No repo-specific deviations from standard unix commands observed (ls/grep/git behave normally on this macOS box). Use `git -C <path>` instead of `cd` when running git in parallel across workspaces (per `.claude/rules/development.md`).

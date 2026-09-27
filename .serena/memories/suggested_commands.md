# Suggested Commands

## Root
- `pnpm check` / `pnpm format` — biome (fix in place); `pnpm knip`, `pnpm jscpd`.
- `pnpm build:sera-mcp` — bundle submodule → `apps/backend/vendor-dist/sera-mcp.mjs` (needed before cdk test/deploy; clone with `--recurse-submodules`).
- `pnpm stack:deploy` / `pnpm stack:destroy` — full deploy/teardown via `scripts/stack.mjs` (reads root `.env`). `pnpm deploy` collides with a pnpm builtin.
- Proxies: `pnpm cdk|backend|frontend|api-spec|shared <args>`.

## Per workspace
- backend: `pnpm --filter backend test` (vitest). Ignore its `build/zip/update/deploy` scripts (scaffold leftovers targeting Lambda `hello`); deploy goes through CDK.
- cdk: `pnpm --filter cdk test` (jest), `build`, `pnpm --filter cdk cdk -- synth|diff|deploy`.
- frontend: `dev`, `build` (tsc -b + vite), `lint` (oxlint), `test` (vitest src), `e2e` (playwright).
- api-spec: `pnpm --filter api-spec run generate | generate:check | postman:generate`.

Use `git -C <path>` rather than `cd` (per `.claude/rules/development.md`).

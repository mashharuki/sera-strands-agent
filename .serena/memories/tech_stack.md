# Tech Stack

- Package manager: pnpm 11.24.0 (pinned via `packageManager` field). Workspace globs: `apps/*`, `packages/*`.
- Root devDeps: Biome 2.5.11 (lint/format), knip 6.33.0 (unused-code detection), TypeScript ^7.0.2, @types/node ^26.
- `apps/cdk`: aws-cdk-lib 2.149.0, aws-cdk CLI 2.149.0, TypeScript ~5.5.3 (older pin, separate from root), Jest 29 + ts-jest for tests.
- `apps/backend`: Hono ^4.13.8, esbuild ^0.28.1 (bundles to `dist/index.js`, `platform=node target=node20`), npm-run-all2 for `deploy` script chaining. Deploys via raw `aws lambda update-function-code` CLI call (no CDK wiring yet).
- `apps/frontend`: React 19.2, Vite 8, TypeScript ~6.0.2 (yet another separate pin), oxlint (not Biome) for `lint` script.
- `packages/shared`, `packages/api-spec`: no dependencies, no source files — placeholders only.

Note: three different TypeScript version pins exist across cdk/frontend/root — not yet unified. Don't assume a single TS version for the whole repo.

# Task Completion Checklist

Mirror CI (`.github/workflows/ci.yml`), running the parts you touched:
1. Edited `packages/api-spec/openapi.yaml` → `pnpm --filter api-spec run generate`, commit generated types; `generate:check` must pass.
2. `pnpm check` (biome) and `pnpm --filter frontend lint` (oxlint).
3. `pnpm --filter backend test`.
4. `pnpm build:sera-mcp` then `pnpm --filter cdk test` for infra changes.
5. `pnpm --filter frontend build` (typecheck + build) for frontend changes.
6. `pnpm knip` when adding/removing code or deps.
7. Commit per `mem:conventions` (Conventional Commits, explicit paths, no `git add -A`).

`shared`/`api-spec` `test` scripts are stubs (exit 1), not gates. Don't claim unverified flows (see `mem:project_status`) work without running them.

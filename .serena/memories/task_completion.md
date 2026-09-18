# Task Completion Checklist

No unified root-level "test"/"typecheck" script exists yet — run per workspace:

1. `pnpm check` (root) — Biome lint+format fix across the whole repo (respects `biome.json` excludes: `.agents`, `.kiro/settings/templates`, `**/.wrangler`, frontend `env.d.ts`, worker-configuration.d.ts files that don't exist yet in this repo but are pre-excluded).
2. Per touched workspace, run its own build/test:
   - cdk: `pnpm --filter cdk build && pnpm --filter cdk test`
   - backend: `pnpm --filter backend build`
   - frontend: `pnpm --filter frontend build` (runs `tsc -b` then vite build — this is the closest thing to a typecheck) and `pnpm --filter frontend lint` (oxlint, separate from root Biome)
3. `pnpm knip` — check for newly-introduced unused exports/files/deps when adding code.
4. Follow `.claude/rules/git-workflow.md` for commit/PR conventions (see `mem:conventions`).

No test suites exist yet for backend/frontend/shared/api-spec (`shared`/`api-spec` `test` scripts are stub `echo "Error: no test specified"`). Don't assume vitest/Playwright are wired up even though `docs/memo.md` names them as the intended target stack — verify before relying on them.

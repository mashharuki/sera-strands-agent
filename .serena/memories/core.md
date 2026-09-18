# sera-strands-agent — Core

pnpm workspace monorepo (`pnpm-workspace.yaml`: `apps/*`, `packages/*`). Root `package.json` name is `aws-strands-agent`; repo intent per `docs/memo.md` is "Sera Protocol対応のフルサーバーレスAIチャットボットをAWS上に構築する" (Strands Agents + Sera Protocol + AWS CDK). **As of onboarding, all apps/packages are unmodified scaffolds — no feature code exists yet** (see `mem:project_status`).

## Layout
- `apps/cdk` — AWS CDK (TypeScript) infra, default `CdkStack`, unmodified starter.
- `apps/backend` — Hono app (`src/index.ts`), built with esbuild for Lambda (`hono/aws-lambda`), single "Hello Hono!" route.
- `apps/frontend` — Vite + React 19, unmodified `create-vite` template.
- `packages/shared`, `packages/api-spec` — empty placeholder packages (no source, `main: index.js` doesn't exist yet).

## Memory graph
- `mem:tech_stack` — languages, frameworks, package manager/version pins.
- `mem:suggested_commands` — root and per-app scripts actually wired up.
- `mem:conventions` — code style / workflow rules from `.claude/rules/*` (also mirrored in `.agents/rules/*`).
- `mem:task_completion` — what to run before considering a task done.
- `mem:project_status` — planning-vs-implementation state; read this before assuming any Sera/Strands/Privy integration exists.

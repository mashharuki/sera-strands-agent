# sera-strands-agent — Core

pnpm workspace monorepo (`apps/*`, `packages/*`). Fully-serverless AWS chatbot for Sera Protocol (Ethereum Sepolia only): CDK + Strands Agents (Bedrock Nova) + Hono + React 19/Vite + Privy + `sera-mcp` (git submodule). **Implemented**, not a scaffold — see `mem:project_status` for what is verified vs not.

## Layout
- `apps/backend` — Hono; `src/{agent,routes,store,auth}`; `/chat` streams NDJSON via Lambda Function URL, rest via API Gateway.
- `apps/cdk` — `DataStack` (DynamoDB), `BackendStack` (API GW + API/Chat Lambdas + Secrets Manager), `FrontendStack` (S3+CloudFront).
- `apps/frontend` — React 19, Privy, TanStack Query, zustand, openapi-fetch; `src/features/*`; Playwright in `e2e/`.
- `packages/api-spec` — `openapi.yaml` is the API source of truth; generated types are a CI gate. `packages/shared` — shared types.
- `vendor/sera-mcp` — submodule pinned `d6f50c1`; bundled by `pnpm build:sera-mcp`.
- `README.md` = setup/env/verification status; `specs/001-sera-protocol-chatbot/` = Spec Kit artifacts; `AGENTS.md` = agent guidance.

## Memory graph
- `mem:tech_stack` — deps and version pins.
- `mem:suggested_commands` — root/per-workspace scripts, deploy flow.
- `mem:conventions` — rules from `.claude/rules/*` (mirrored in `.agents/rules/*`).
- `mem:task_completion` — what to run before calling a task done (mirrors CI).
- `mem:project_status` — implemented vs verified state; Sera API key handling.

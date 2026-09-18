# Project Status (check before assuming feature work exists)

Per `docs/memo.md` (日本語, dated planning request): the goal is a fully-serverless AWS chatbot for Sera Protocol (wallet creation/balance, orderbook/trade info, stablecoin swap, transfers) built with AWS CDK + Strands Agents (TS SDK) + Hono + React/Vite + Privy + sera-mcp/sera-agents + Ethereum Sepolia, exposed via OpenAPI-first contracts, with a companion Japanese technical blog post as a deliverable.

**Nothing from that spec is implemented yet** as of onboarding:
- No Strands Agents, Privy, sera-mcp, sera-agents, zod, zustand, Tanstack, Turbo, vitest, or Playwright dependencies exist in any package.json.
- `apps/backend` is a stock Hono "Hello Hono!" handler; `apps/cdk` is a stock empty `CdkStack`; `apps/frontend` is a stock Vite+React template.
- `packages/shared` and `packages/api-spec` have no source files.
- The memo explicitly asks to research first and NOT implement, deploy, or make on-chain transactions in that turn — treat any absence of Sera/Strands integration as expected, not a bug, unless later conversation shows implementation began.

When resuming this work: check `git log` / current branch for whether planning docs or an implementation plan were produced after this memo, since this snapshot reflects only the state at onboarding time.

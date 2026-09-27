# Tech Stack

- pnpm 11.24.0 (`packageManager`), Node 22+. Biome 2.5.x (root lint/format), knip, esbuild.
- backend: Hono, `@strands-agents/sdk`, `@modelcontextprotocol/sdk`, `@privy-io/node`, viem, zod, AWS SDK v3 (Bedrock Runtime, DynamoDB, Secrets Manager); tests vitest + aws-sdk-client-mock. Bedrock default Amazon Nova 2 Lite (`jp.amazon.nova-2-lite-v1:0`, `ap-northeast-1`).
- cdk: aws-cdk-lib, `NodejsFunction`, jest + ts-jest.
- frontend: React 19, Vite, `@privy-io/react-auth`, TanStack Query, zustand, openapi-fetch; oxlint (not biome), vitest, Playwright.
- api-spec: openapi-typescript (chosen over Java OpenAPI Generator), openapi-to-postmanv2, newman.
- sera-mcp v1 via git submodule (v2 rejected: server-held keys, stdio only, no LICENSE).
- TypeScript version pins differ per workspace (cdk ~5.5, frontend ~6.0, api-spec ^5.7, root ^7.0); not unified. Check package.json for exact versions rather than trusting this note.

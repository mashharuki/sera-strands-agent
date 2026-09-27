I just shipped a non-custodial AI agent for Sera Protocol (Ethereum Sepolia) — chat in natural language, get a wallet, check balances, swap stablecoins, and transfer, entirely on serverless AWS.

Stack: AWS CDK (Lambda / API Gateway / DynamoDB / S3 / CloudFront) + Strands Agents (TypeScript SDK) + Amazon Bedrock (Nova) + Hono + React/Privy, talking to Sera through sera-mcp.

The interesting part wasn't the happy path — it was everything that broke on the way there:

→ Sera's API keys turned out to be wallet-scoped (you sign an EIP-712 message with your own wallet to mint one). A single server-side operator key can't act on behalf of every user, so instead of depending on it, the app reads balances directly on-chain, builds transfers with viem, and confirms swap settlement by watching on-chain Transfer logs — no shared credential in the critical path.

→ A failed swap just said "swap execution failed," full stop. Turned out the real reason (insufficient balance) was being computed and then thrown away before it reached the UI. Fixed it to surface the server's actual message — a one-line diff that turned a silent dead end into something the user can act on.

→ The market panel was rendering raw JSON to end users. Rebuilt it as an actual quote card, a color-coded bid/ask table, and a trade history list — same data, but now something a person would actually read.

→ Got a real swap through end-to-end on Sepolia (USDT → USDC), confirmed by the wallet's on-chain balance change, not by trusting the LLM's word for it. Every state-changing action still requires explicit chat approval + the user's own wallet signature before anything is broadcast — the agent proposes, it never signs.

This is a dev-stage, testnet project, not production, but the design principle carries over: separate "read" from "state-changing," verify everything from on-chain/API truth rather than model output, and never let a shared secret stand in for per-user authorization.

Code's open: https://github.com/mashharuki/sera-strands-agent

#AWS #AIAgents #Web3 #NonCustodial #BuildInPublic

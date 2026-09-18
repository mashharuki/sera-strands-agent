import { type ChildProcess, spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * sera-mcp(v1) は npm レジストリに未公開のため（research.md §9-A）、
 * 通常の依存関係としては解決できない。ビルド済みバイナリのパスを
 * `SERA_MCP_BIN` で受け取り、子プロセスとして起動する。
 * デプロイ側（apps/cdk のバンドリング or デプロイスクリプト）が
 * `SERA_MCP_BIN` の指すファイルを用意する責任を持つ（未実装、T075参照）。
 *
 * research.md §4.2 の決定: `--transport http --stateless --host 127.0.0.1`
 * でループバック起動し、同一Lambda実行環境内から呼び出す。
 * research.md §1.2 の決定: 署名モードは `external`（サーバーは署名しない、
 * 非カストディアル）。
 */

let child: ChildProcess | undefined;
let client: Client | undefined;
let readyPromise: Promise<Client> | undefined;

const PORT = Number(process.env.SERA_MCP_PORT ?? 3848);

function spawnSeraMcp(): ChildProcess {
  const bin = process.env.SERA_MCP_BIN;
  if (!bin) {
    throw new Error(
      "SERA_MCP_BIN is not set. Build sera-cx/sera-mcp (pinned commit, see research.md §1.2) and point SERA_MCP_BIN at its dist/index.js.",
    );
  }
  const proc = spawn(
    process.execPath,
    [
      bin,
      "--transport",
      "http",
      "--stateless",
      "--host",
      "127.0.0.1",
      "--port",
      String(PORT),
    ],
    {
      env: {
        ...process.env,
        SERA_NETWORK: process.env.SERA_NETWORK ?? "sepolia",
        SERA_SIGNER_MODE: "external",
        SERA_HTTP_STATELESS: "true",
        POLICY_DRY_RUN: process.env.POLICY_DRY_RUN ?? "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  proc.stderr?.on("data", (chunk: Buffer) => {
    console.error("[sera-mcp]", chunk.toString());
  });
  return proc;
}

async function waitForHealth(baseUrl: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("sera-mcp did not become healthy within timeout");
}

/**
 * 同一Lambda実行環境の再利用（ウォームスタート）をまたいで、子プロセスと
 * MCPクライアント接続を使い回す。初回呼び出し時のみ起動する。
 */
export async function getSeraMcpClient(): Promise<Client> {
  if (client) return client;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    child = spawnSeraMcp();
    const baseUrl = `http://127.0.0.1:${PORT}`;
    await waitForHealth(baseUrl);

    const mcpClient = new Client({
      name: "sera-strands-agent-backend",
      version: "0.1.0",
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/mcp`),
    );
    await mcpClient.connect(transport);
    client = mcpClient;
    return mcpClient;
  })();

  return readyPromise;
}

export async function callSeraTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const mcpClient = await getSeraMcpClient();
  const result = await mcpClient.callTool({ name, arguments: args });
  return result;
}

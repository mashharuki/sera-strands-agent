import { type ChildProcess, spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadSeraCredentials, type SeraCredentials } from "./sera-auth";

/**
 * sera-mcp(v1) は npm レジストリに未公開のため（research.md §9-A）、
 * 通常の依存関係としては解決できない。ビルド済みバイナリのパスを
 * `SERA_MCP_BIN` で受け取り、子プロセスとして起動する。
 * デプロイ側（apps/cdk のバンドリング or デプロイスクリプト）が
 * `SERA_MCP_BIN` の指すファイルを用意する責任を持つ（未実装、T075参照）。
 *
 * research.md §4.2 の決定: `--transport http --host 127.0.0.1` でループバック起動し、
 * 同一Lambda実行環境内から呼び出す。
 * `--stateless` は使わない（実測で判明）: sera-mcp v1 のstatelessモードは単一の
 * トランスポートを使い回す実装で、同梱のMCP SDK 1.30.0が2回目のリクエストを
 * "Stateless transport cannot be reused across requests" で拒否するため、接続に失敗する。
 * ステートフルモードで1セッションを保ち、子プロセスごとに1回だけ接続する。
 * research.md §1.2 の決定: 署名モードは `external`（サーバーは署名しない、
 * 非カストディアル）。
 */

let child: ChildProcess | undefined;
let client: Client | undefined;
let readyPromise: Promise<Client> | undefined;

const PORT = Number(process.env.SERA_MCP_PORT ?? 3848);

function spawnSeraMcp(credentials?: SeraCredentials): ChildProcess {
  const bin = process.env.SERA_MCP_BIN;
  if (!bin) {
    throw new Error(
      "SERA_MCP_BIN is not set. Build sera-cx/sera-mcp (pinned commit, see research.md §1.2) and point SERA_MCP_BIN at its dist/index.js.",
    );
  }
  const proc = spawn(
    process.execPath,
    [bin, "--transport", "http", "--host", "127.0.0.1", "--port", String(PORT)],
    {
      env: {
        ...process.env,
        // 資格情報は子プロセスの環境変数としてのみ渡す（ログ・レスポンスには出さない）
        ...(credentials && {
          SERA_API_KEY: credentials.apiKey,
          SERA_API_SECRET: credentials.apiSecret,
        }),
        SERA_NETWORK: process.env.SERA_NETWORK ?? "sepolia",
        SERA_SIGNER_MODE: "external",
        POLICY_DRY_RUN: process.env.POLICY_DRY_RUN ?? "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  proc.stderr?.on("data", (chunk: Buffer) => {
    console.error("[sera-mcp]", chunk.toString());
  });
  // 子プロセスが落ちたら、次の呼び出しで再起動・再接続できるよう状態を捨てる。
  proc.on("exit", (code, signal) => {
    console.error("[sera-mcp] exited", { code, signal });
    if (child === proc) resetConnection();
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

function resetConnection(): void {
  child = undefined;
  client = undefined;
  readyPromise = undefined;
}

/**
 * 同一Lambda実行環境の再利用（ウォームスタート）をまたいで、子プロセスと
 * MCPクライアント接続を使い回す。初回呼び出し時のみ起動する。
 */
export async function getSeraMcpClient(): Promise<Client> {
  if (client) return client;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    try {
      child = spawnSeraMcp(await loadSeraCredentials());
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
    } catch (error) {
      // 失敗した接続をキャッシュしない（以前は拒否されたPromiseが残り、以降の呼び出しが
      // すべて即座に失敗していた）。子プロセスも片付けて、次回は最初からやり直す。
      child?.kill();
      resetConnection();
      throw error;
    }
  })();

  return readyPromise;
}

interface McpToolResult {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
}

/**
 * sera-mcpのツール名は`sera.`接頭辞付き（例: `sera.get_quote`。registry.ts参照）。
 * MCPの生の結果（`content[].text`にJSON文字列）をパースして返し、
 * `isError`の場合は成功と誤認しないよう例外にする（FR-017）。
 */
export async function callSeraTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const mcpClient = await getSeraMcpClient();
  const result = (await mcpClient.callTool({
    name,
    arguments: args,
  })) as McpToolResult;

  const text = result.content?.find((c) => c.type === "text")?.text;
  if (result.isError) {
    throw new Error(text ?? `sera-mcp tool ${name} returned an error`);
  }
  if (result.structuredContent !== undefined) return result.structuredContent;
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** `sera://config`等のMCPリソース（JSON）を読む。EIP-712 domainの取得に使う。 */
export async function readSeraResource(uri: string): Promise<unknown> {
  const mcpClient = await getSeraMcpClient();
  const res = await mcpClient.readResource({ uri });
  const text =
    res.contents?.[0] && "text" in res.contents[0]
      ? res.contents[0].text
      : undefined;
  return typeof text === "string" ? JSON.parse(text) : undefined;
}

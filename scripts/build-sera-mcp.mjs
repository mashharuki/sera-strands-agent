// vendor/sera-mcp（git submodule、固定コミット）をビルドし、Lambdaに同梱できる
// 単一ファイル（apps/backend/vendor-dist/sera-mcp.mjs）へバンドルする。
//
// sera-mcpはnpm未公開で`prepare`スクリプトも無いため、自前でビルドする（research.md §9-A）。
// better-sqlite3（ネイティブ）はsera-mcpの履歴DB専用で、`SERA_HISTORY_DB`未設定なら
// インスタンス化されない。Lambda(Linux)ではmacで作ったネイティブバイナリが使えないため、
// 明示的に失敗するスタブへ差し替える（履歴DBを誤って有効化した場合に沈黙せず落とすため）。
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = resolve(root, "vendor/sera-mcp");
const outDir = resolve(root, "apps/backend/vendor-dist");
const outfile = resolve(outDir, "sera-mcp.mjs");
const stub = resolve(outDir, ".better-sqlite3-stub.mjs");

const PINNED = "d6f50c1aa6098354d796b777a5474989e9acc1f7";
const head = execFileSync("git", ["-C", vendor, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (head !== PINNED) {
  throw new Error(
    `vendor/sera-mcp が固定コミットではありません: ${head} (期待: ${PINNED})。` +
      "`git submodule update --init` を実行してください。",
  );
}

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: vendor, stdio: "inherit" });

// ネイティブビルドは不要（スタブ差し替えのため）なので--ignore-scripts。
run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
run("npx", ["tsc"]);

mkdirSync(outDir, { recursive: true });
writeFileSync(
  stub,
  `export default class Database {
  constructor() {
    throw new Error("better-sqlite3 is not bundled in the Lambda build. Do not set SERA_HISTORY_DB.");
  }
}
`,
);

await build({
  entryPoints: [resolve(vendor, "dist/index.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile,
  alias: { "better-sqlite3": stub },
  // CJS依存(express等)をESMバンドルに含めるためのrequire互換。
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "warning",
});

console.log(`built ${outfile} from sera-mcp@${PINNED.slice(0, 7)}`);

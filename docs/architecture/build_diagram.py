"""アーキテクチャ図(docs/architecture/architecture.drawio)の生成元。

スキル `architecture-diagram-drawio` の `scripts/dio.py` を使う。
再生成: python3 docs/architecture/build_diagram.py
SVGへの書き出し: drawio -x -f svg -o docs/architecture/architecture.svg docs/architecture/architecture.drawio
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".claude/skills/architecture-diagram-drawio/scripts"))

from dio import AWS, GENERIC, GROUPS, Diagram  # noqa: E402
from dio import EDGE_STYLE as EDGE  # noqa: E402

d = Diagram(width=1750, height=950)

d.text("Sera AI Agent — フルサーバーレス構成 (Ethereum Sepolia)", 40, 10, 900, 30)

# --- リージョン外 ---
user = d.node("ユーザー\n(ブラウザ / React)", AWS["user"], 50, 330, 60, 60)
privy = d.node(
    "Privy\n認証・埋め込みウォレット\n(署名はここで行う)", GENERIC["box_gray"], 20, 700, 150, 70
)
sera = d.node("Sera Protocol\n(Sepolia)", GENERIC["box_purple"], 1520, 475, 150, 70)

# --- AWS リージョン ---
region = d.container("AWS Region (ap-northeast-1)", GROUPS["region"], 220, 50, 1240, 830)
P = region

# 行1: 画面配信 / 行2: REST API / 行3: チャット
cf = d.node("CloudFront", AWS["cloudfront"], 40, 60, parent=P)
s3 = d.node("S3\n(SPA 静的配信)", AWS["s3"], 300, 60, parent=P)

apigw = d.node("API Gateway\n(HTTP API)", AWS["api_gateway"], 40, 260, parent=P)
api_fn = d.node(
    "Lambda (Hono)\n/wallet /market /transactions", AWS["lambda"], 300, 260, parent=P
)
ddb = d.node("DynamoDB\n(単一テーブル + TTL)", AWS["dynamodb"], 700, 365, parent=P)

chat_fn = d.node(
    "Lambda (Hono + Strands)\n/chat Function URL\nRESPONSE_STREAM",
    AWS["lambda"].replace(
        "verticalLabelPosition=bottom;verticalAlign=top;align=center;",
        "labelPosition=right;verticalLabelPosition=middle;verticalAlign=middle;align=left;spacingBottom=60;",
    ),
    300,
    470,
    parent=P,
)
mcp = d.node(
    "sera-mcp v1\n(子プロセス 127.0.0.1)\n固定コミット d6f50c1",
    GENERIC["box_orange"],
    880,
    475,
    170,
    70,
    parent=P,
)
bedrock = d.node("Bedrock\n(Amazon Nova)", AWS["bedrock"], 300, 690, parent=P)
cred = d.node(
    "Secrets Manager\n(Sera 運用者資格情報)", AWS["secrets_manager"], 40, 690, parent=P
)

# --- 接続 ---
d.edge(user, cf, "HTTPS 画面配信", style=EDGE + "exitX=0.5;exitY=0;entryX=0;entryY=0.5;")
d.edge(cf, s3, "OAC")
d.edge(user, apigw, "REST + Privy JWT", style=EDGE + "exitX=1;exitY=0.5;entryX=0;entryY=0.5;")
d.edge(apigw, api_fn, "プロキシ統合")
d.edge(api_fn, ddb, "承認/取引/冪等キー", style=EDGE + "exitX=1;exitY=0.5;entryX=0.5;entryY=0;")
d.edge(user, chat_fn, "POST /chat (NDJSON)", style=EDGE + "exitX=0.5;exitY=1;entryX=0;entryY=0.5;")
d.edge(chat_fn, ddb, "会話/見積", style=EDGE + "exitX=0.85;exitY=0;entryX=0;entryY=0.5;")
d.edge(
    chat_fn,
    bedrock,
    "推論",
    style=EDGE + "exitX=0.5;exitY=1;entryX=0.5;entryY=0;",
)
d.edge(chat_fn, mcp, "MCP (ループバック)")
d.edge(mcp, sera, "Sera API")
d.edge(
    cred,
    chat_fn,
    "資格情報",
    style=EDGE + "exitX=0.5;exitY=0;entryX=0.15;entryY=1;",
    dashed=True,
)
d.edge(user, privy, "ログイン / 署名", style=EDGE + "exitX=0;exitY=0.5;entryX=0.5;entryY=0;", dashed=True)

# --- 凡例 ---
d.text(
    "実線: 同期呼び出し / 破線: 認証・資格情報\n"
    "資産変更 (swap・送金) は チャット承認 + ユーザー自身のウォレット署名が必須 (非カストディアル)",
    240,
    895,
    1000,
    40,
    style="text;html=1;align=left;verticalAlign=top;fontSize=12;fontColor=#545B64;",
)

out = Path(__file__).with_name("architecture.drawio")
d.save(str(out), name="Architecture")
print(f"wrote {out}")

import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";
import { privyAuthMiddleware } from "./auth/privy.js";
import { marketRoutes } from "./routes/market.js";
import { transactionRoutes } from "./routes/transactions.js";
import { walletRoutes } from "./routes/wallet.js";

export const app = new Hono();

// CORSはここで処理する（API GatewayのcorsPreflight設定は、プロキシ経路のOPTIONSと
// 噛み合わず「preflightがHTTP okでない」となったため使わない）。認証ミドルウェアより前に置き、
// 認証なしのpreflight(OPTIONS)が401にならないようにする。Bearerトークン方式でCookieは使わないので "*" で足りる。
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    maxAge: 600,
  }),
);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.use("/wallet", privyAuthMiddleware());
app.use("/wallet/*", privyAuthMiddleware());
app.use("/market/*", privyAuthMiddleware());
app.use("/transactions/*", privyAuthMiddleware());
app.route("/", walletRoutes);
app.route("/", marketRoutes);
app.route("/", transactionRoutes);

export const handler = handle(app);

import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { privyAuthMiddleware } from "./auth/privy.js";
import { marketRoutes } from "./routes/market.js";
import { walletRoutes } from "./routes/wallet.js";

export const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.use("/wallet", privyAuthMiddleware());
app.use("/wallet/*", privyAuthMiddleware());
app.use("/market/*", privyAuthMiddleware());
app.route("/", walletRoutes);
app.route("/", marketRoutes);

export const handler = handle(app);

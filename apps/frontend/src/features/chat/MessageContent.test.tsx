import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageContent } from "./MessageContent.tsx";

describe("MessageContent", () => {
  it("renders balance markdown as semantic text without exposing markers", () => {
    const html = renderToStaticMarkup(
      <MessageContent
        text={[
          "あなたのウォレット残高は以下の通りです。",
          "",
          "- **ETH**: 0.1 ETH",
          "- **USDT**: 10,000.699943 USDT",
        ].join("\n")}
      />,
    );

    expect(html).toContain("<ul>");
    expect(html).toContain("<strong>ETH</strong>");
    expect(html).toContain("<strong>USDT</strong>");
    expect(html).not.toContain("**");
  });
});

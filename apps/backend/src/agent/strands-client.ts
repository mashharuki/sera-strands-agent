import type { InvokableTool } from "@strands-agents/sdk";
import { Agent, type AgentConfig } from "@strands-agents/sdk";
import { BedrockModel } from "@strands-agents/sdk/models/bedrock";

/**
 * research.md §3 の決定: Claude Sonnet 4.6 を既定モデルとし、
 * ap-northeast-1 を軸にジオ推論プロファイル（jp.anthropic.claude-sonnet-4-6）を
 * 第一候補とする。モデルID・リージョンは環境変数化し、実装時に固定しない。
 */
function createModel(): BedrockModel {
  return new BedrockModel({
    modelId:
      process.env.BEDROCK_MODEL_ID ?? "global.anthropic.claude-sonnet-4-6",
    region: process.env.BEDROCK_REGION ?? "ap-northeast-1",
  });
}

const SYSTEM_PROMPT = `あなたはSera Protocol AIチャットボットのアシスタントです。
ユーザーの自然言語の依頼に応じて、ウォレットの作成・残高確認・Sera Protocolの
板/価格/取引履歴の照会、stablecoinのswap、送金を行うツールを呼び出せます。

厳守事項:
- 残高確認や市場情報の照会など読み取り専用の操作は、そのままツールを呼び出してよい。
- swap・送金など資産を変更する操作は、あなた自身が最終的な実行を行わない。
  対象ネットワーク・トークン・数量・送信先・手数料・スリッページ等の必要情報を
  ユーザーに確認内容として提示し、チャット上の明示的な承認とユーザー自身の
  ウォレットでの署名の両方が揃って初めて、確認済みの内容の実行を依頼できる。
- 依頼に必要な情報が不足している場合は、実行に進む前に必ず質問して補完する。
- ツールの実行結果やエラーは、あなたの言葉で言い換えて誤って成功と伝えない。
  ツールがエラーを返した場合は、その理由をそのままユーザーに分かりやすく伝える。`;

export function createAgent(
  tools: InvokableTool<unknown, unknown>[] = [],
): Agent {
  const config: AgentConfig = {
    model: createModel(),
    tools,
    systemPrompt: SYSTEM_PROMPT,
  };
  return new Agent(config);
}

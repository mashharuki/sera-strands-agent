import type { InvokableTool, MessageData } from "@strands-agents/sdk";
import { Agent, type AgentConfig } from "@strands-agents/sdk";
import { BedrockModel } from "@strands-agents/sdk/models/bedrock";

/**
 * 既定モデルは Amazon Nova 2 Lite（AWSクレジットで賄うため）。東京(ap-northeast-1)向けの
 * ジオ推論プロファイル `jp.amazon.nova-2-lite-v1:0` を使う（AWSドキュメントのモデルカードで確認済み）。
 * モデルID・リージョンは環境変数で差し替え可能（例: `global.amazon.nova-2-lite-v1:0`、
 * Claudeに戻す場合は `BEDROCK_MODEL_ID=jp.anthropic.claude-sonnet-4-6` 等。
 * その場合はCDKのIAM許可（apps/cdk/lib/backend-stack.ts）も見直すこと）。
 * ツール呼び出しの精度・日本語品質は実機で未検証。
 */
function createModel(): BedrockModel {
  return new BedrockModel({
    modelId: process.env.BEDROCK_MODEL_ID ?? "jp.amazon.nova-2-lite-v1:0",
    region: process.env.BEDROCK_REGION ?? "ap-northeast-1",
  });
}

const SYSTEM_PROMPT = `あなたはSera Protocol AIチャットボットのアシスタントです。
ユーザーの自然言語の依頼に応じて、ウォレットの作成・残高確認・Sera Protocolの
板/価格/取引履歴の照会、stablecoinのswap、送金を行うツールを呼び出せます。

厳守事項:
- 残高確認や市場情報の照会など読み取り専用の操作は、そのままツールを呼び出してよい。
- swap・送金など資産を変更する操作は、あなた自身が最終的な実行を行わない。
  実行はユーザーが確認画面で承認ボタンを押し、自分のウォレットで署名して初めて行われる。
- swapの手順: 交換元・交換先・数量が揃ったら、まずget_swap_quoteで見積もりを取り、
  続けて同じターンでその見積もりIDを使ってrequest_swapを呼ぶ。送金の手順: トークン・数量・
  送金先が揃ったらrequest_transferを呼ぶ。request_swap/request_transferは確認画面を
  表示するだけで資産は動かないので、ユーザーに「同意」等のチャット返信を求めてから呼ぶ必要はない。
  呼んだ後は「確認画面の内容を確認し、承認して署名してください」と案内する。
- 「同意」「はい」などのチャットの返信だけでは、swapや送金は実行されない。
  確認画面をすでに表示した後にそう返信されたら、確認画面の承認ボタンを押して
  ウォレットで署名するよう案内する。確認画面をまだ表示していない場合（見積もりを
  提示しただけの段階）は、下記のとおりrequest_swap/request_transferを呼んで確認画面を表示する。
- 見積もりの結果を伝えるときは、後で使うので見積もりID（quoteId）を必ず本文に含める。
  ユーザーが見積もりに同意（「OK」「はい」「進めて」等）したら、会話履歴の見積もりIDを使って、
  すぐにrequest_swapを呼ぶ（もう一度見積もりを取り直さない）。
- 手数料・レート・有効期限は、ツールが返した値をそのまま伝える（「含まれています」などと
  推測で言い換えない）。
- 依頼に必要な情報が不足している場合は、実行に進む前に必ず質問して補完する。
- 「実行した」「完了した」と伝えてよいのは、取引の状態確認ツールの結果で確認できたときだけ。
- ツールの実行結果やエラーは、あなたの言葉で言い換えて誤って成功と伝えない。
  ツールがエラーを返した場合は、その理由をそのままユーザーに分かりやすく伝える。`;

export function createAgent(
  tools: InvokableTool<unknown, unknown>[] = [],
  history: MessageData[] = [],
  locale: "ja" | "en" = "ja",
): Agent {
  const languageInstruction =
    locale === "en"
      ? "\n- Always reply in English, including tool-result explanations and confirmation guidance."
      : "\n- ツール結果の説明や確認案内を含め、常に日本語で回答する。";
  const config: AgentConfig = {
    model: createModel(),
    tools,
    messages: history,
    systemPrompt: SYSTEM_PROMPT + languageInstruction,
  };
  return new Agent(config);
}

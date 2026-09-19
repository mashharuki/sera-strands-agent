import * as fs from "node:fs";
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export interface BackendStackProps extends cdk.StackProps {
  table: dynamodb.ITableV2;
  stage: string;
}

/** デプロイ時にプロセス環境から引き継ぐ、秘密情報ではない設定値。未設定ならその機能が実行時に明示的に失敗する。 */
const PASSTHROUGH_ENV = [
  "PRIVY_APP_ID",
  "PRIVY_VERIFICATION_KEY",
  "SEPOLIA_RPC_URL",
  "BEDROCK_MODEL_ID",
  "BEDROCK_REGION",
  "POLICY_DRY_RUN",
];

/**
 * research.md §4.1 の決定に基づく2系統構成:
 * - 読み取り/実行系（wallet, market, transactions）は API Gateway HTTP API
 *   経由の通常の Lambda（API Gateway の29秒タイムアウト内で完結する想定）。
 * - チャット（/chat）は Lambda Function URL のレスポンスストリーミング
 *   （InvokeMode.RESPONSE_STREAM）を使い、29秒の壁を回避する。
 */
export class BackendStack extends cdk.Stack {
  readonly apiUrl: string;
  readonly chatUrl: string;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const runtime = lambda.Runtime.NODEJS_22_X;

    // sera-mcp（git submodule、固定コミット）は `pnpm build:sera-mcp` で単一ファイルにバンドルされる。
    // 下のcommandHooksでLambdaのコード直下へ同梱し、バックエンドが子プロセスとして起動する。
    const seraMcpBundle = path.join(
      __dirname,
      "../../backend/vendor-dist/sera-mcp.mjs",
    );
    if (!fs.existsSync(seraMcpBundle)) {
      throw new Error(
        `sera-mcpのバンドルがありません: ${seraMcpBundle}\n` +
          "`git submodule update --init && pnpm build:sera-mcp` を先に実行してください。",
      );
    }

    // Seraの運用者資格情報の保管先。スタック内で「空のプレースホルダー」だけを作成し、
    // 実際の値はデプロイ後に利用者が `aws secretsmanager put-secret-value` で設定する
    // （値をコード・テンプレート・チャットに出さないため。README参照）。
    // - 値はテンプレートに含まれないため、再デプロイしても設定済みの値は上書きされない。
    // - スタックの管理下にあり、destroyで一緒に削除される（removalPolicy: DESTROY）。
    // - 名前は固定しない: Secrets Managerは削除後に復旧期間があり、同名での再作成が失敗するため。
    const seraSecret = new secretsmanager.Secret(this, "SeraCredentials", {
      description: `Sera運用者資格情報 (${props.stage})。デプロイ後に apiKey / apiSecret を設定すること`,
      secretObjectValue: {
        apiKey: cdk.SecretValue.unsafePlainText(""),
        apiSecret: cdk.SecretValue.unsafePlainText(""),
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const commonEnvironment: Record<string, string> = {
      TABLE_NAME: props.table.tableName,
      SERA_NETWORK: "sepolia",
      SERA_MCP_BIN: "/var/task/sera-mcp.mjs",
      SERA_SECRET_ID: seraSecret.secretArn,
      ...Object.fromEntries(
        PASSTHROUGH_ENV.filter((k) => process.env[k]).map((k) => [
          k,
          process.env[k] as string,
        ]),
      ),
    };

    const bundling: nodejs.BundlingOptions = {
      format: nodejs.OutputFormat.ESM,
      mainFields: ["module", "main"],
      commandHooks: {
        beforeBundling: () => [],
        beforeInstall: () => [],
        afterBundling: (_inputDir: string, outputDir: string) => [
          `cp "${seraMcpBundle}" "${outputDir}/sera-mcp.mjs"`,
        ],
      },
    };

    const apiFn = new nodejs.NodejsFunction(this, "ApiFunction", {
      runtime,
      entry: path.join(__dirname, "../../backend/src/index.ts"),
      handler: "handler",
      environment: commonEnvironment,
      timeout: cdk.Duration.seconds(29),
      memorySize: 512,
      bundling,
    });
    props.table.grantReadWriteData(apiFn);
    seraSecret.grantRead(apiFn);

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ["Authorization", "Content-Type"],
      },
    });
    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration(
        "ApiIntegration",
        apiFn,
      ),
    });
    this.apiUrl = httpApi.apiEndpoint;

    const chatFn = new nodejs.NodejsFunction(this, "ChatFunction", {
      runtime,
      entry: path.join(__dirname, "../../backend/src/routes/chat-handler.ts"),
      handler: "handler",
      environment: commonEnvironment,
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      bundling,
    });
    props.table.grantReadWriteData(chatFn);
    seraSecret.grantRead(chatFn);
    // Strands Agent が Bedrock（既定: Amazon Nova）を呼ぶための権限。
    // クロスリージョン推論プロファイルは、プロファイル自体と、ルーティング先リージョンの
    // 基盤モデルの両方への許可が必要なため、基盤モデルはリージョンをワイルドカードにする。
    chatFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: [
          "arn:aws:bedrock:*::foundation-model/amazon.nova-*",
          `arn:aws:bedrock:*:${this.account}:inference-profile/*.amazon.nova-*`,
        ],
      }),
    );

    const chatUrl = chatFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      cors: { allowedOrigins: ["*"], allowedMethods: [lambda.HttpMethod.POST] },
    });
    this.chatUrl = chatUrl.url;

    new cdk.CfnOutput(this, "ApiUrl", { value: this.apiUrl });
    new cdk.CfnOutput(this, "ChatUrl", { value: this.chatUrl });
    // デプロイ後に資格情報を設定する対象（値ではなくARNのみを出力する）。
    new cdk.CfnOutput(this, "SeraSecretArn", { value: seraSecret.secretArn });
  }
}

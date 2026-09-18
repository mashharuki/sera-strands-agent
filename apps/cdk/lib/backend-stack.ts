import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import type { Construct } from "constructs";

export interface BackendStackProps extends cdk.StackProps {
  table: dynamodb.ITableV2;
}

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
    const commonEnvironment = {
      TABLE_NAME: props.table.tableName,
      SERA_NETWORK: "sepolia",
    };

    const apiFn = new nodejs.NodejsFunction(this, "ApiFunction", {
      runtime,
      entry: path.join(__dirname, "../../backend/src/index.ts"),
      handler: "handler",
      environment: commonEnvironment,
      timeout: cdk.Duration.seconds(29),
      memorySize: 512,
      bundling: {
        format: nodejs.OutputFormat.ESM,
        mainFields: ["module", "main"],
      },
    });
    props.table.grantReadWriteData(apiFn);

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
      bundling: {
        format: nodejs.OutputFormat.ESM,
        mainFields: ["module", "main"],
      },
    });
    props.table.grantReadWriteData(chatFn);

    const chatUrl = chatFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      cors: { allowedOrigins: ["*"], allowedMethods: [lambda.HttpMethod.POST] },
    });
    this.chatUrl = chatUrl.url;

    new cdk.CfnOutput(this, "ApiUrl", { value: this.apiUrl });
    new cdk.CfnOutput(this, "ChatUrl", { value: this.chatUrl });
  }
}

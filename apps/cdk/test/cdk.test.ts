import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { BackendStack } from "../lib/backend-stack";
import { DataStack } from "../lib/data-stack";
import { FrontendStack } from "../lib/frontend-stack";

// esbuildによる実バンドルは重いのでテストではスキップする（アセット同梱はsynth/デプロイ時に確認）。
const buildTemplates = (): {
  data: Template;
  backend: Template;
  frontend: Template;
} => {
  const app = new cdk.App({
    context: { "aws:cdk:bundling-stacks": [] },
  });
  const env = { account: "123456789012", region: "ap-northeast-1" };
  const dataStack = new DataStack(app, "Data", { env });
  const backendStack = new BackendStack(app, "Backend", {
    env,
    table: dataStack.table,
    stage: "test",
  });
  const frontendStack = new FrontendStack(app, "Frontend", { env });
  return {
    data: Template.fromStack(dataStack),
    backend: Template.fromStack(backendStack),
    frontend: Template.fromStack(frontendStack),
  };
};

describe("SeraChatbot stacks", () => {
  const { data, backend, frontend } = buildTemplates();

  it("should create a DynamoDB table with TTL when DataStack is synthesized", () => {
    data.resourceCountIs("AWS::DynamoDB::GlobalTable", 1);
    data.hasResourceProperties("AWS::DynamoDB::GlobalTable", {
      TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
    });
  });

  it("should stream chat responses via Function URL when BackendStack is synthesized", () => {
    backend.hasResourceProperties("AWS::Lambda::Url", {
      InvokeMode: "RESPONSE_STREAM",
    });
  });

  it("should create an HTTP API and two Lambda functions when BackendStack is synthesized", () => {
    backend.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    const fns = backend.findResources("AWS::Lambda::Function", {
      Properties: { Handler: "index.handler" },
    });
    expect(Object.keys(fns)).toHaveLength(2);
  });

  it("should keep Sera credentials out of the template when BackendStack is synthesized", () => {
    backend.hasResourceProperties("AWS::SecretsManager::Secret", {
      GenerateSecretString: Match.absent(),
      SecretString: '{"apiKey":"","apiSecret":""}',
    });
    const json = JSON.stringify(backend.toJSON());
    expect(json).not.toMatch(/SERA_API_(KEY|SECRET)"/);
  });

  it("should delete the secret with the stack when BackendStack is destroyed", () => {
    backend.hasResource("AWS::SecretsManager::Secret", {
      DeletionPolicy: "Delete",
    });
  });

  it("should expose the secret ARN to functions instead of the value", () => {
    backend.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          SERA_SECRET_ID: Match.anyValue(),
          SERA_NETWORK: "sepolia",
        }),
      },
    });
  });

  it("should allow the chat function to invoke Bedrock Nova models", () => {
    backend.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              "bedrock:InvokeModel",
              "bedrock:InvokeModelWithResponseStream",
            ],
          }),
        ]),
      },
    });
  });

  it("should create a CloudFront distribution when FrontendStack is synthesized", () => {
    frontend.resourceCountIs("AWS::CloudFront::Distribution", 1);
  });
});

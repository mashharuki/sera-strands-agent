#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { BackendStack } from "../lib/backend-stack";
import { DataStack } from "../lib/data-stack";
import { FrontendStack } from "../lib/frontend-stack";

const app = new cdk.App();
const stage = app.node.tryGetContext("stage") ?? process.env.STAGE ?? "dev";
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
};

const dataStack = new DataStack(app, `SeraChatbot-${stage}-Data`, { env });
const backendStack = new BackendStack(app, `SeraChatbot-${stage}-Backend`, {
  env,
  table: dataStack.table,
  stage,
});
backendStack.addStackDependency(dataStack);
const frontendStack = new FrontendStack(app, `SeraChatbot-${stage}-Frontend`, {
  env,
});
frontendStack.addStackDependency(backendStack);

import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";

/**
 * 単一テーブル設計。data-model.md のエンティティ（User/Wallet/Quote/
 * ApprovalRequest/Transaction/ConversationMessage）を PK/SK のプレフィックスで
 * 格納する。Quote と ApprovalRequest は `expiresAt`（epoch seconds）を
 * DynamoDB TTL 属性として使う（FR-011 の失効判定基盤）。
 */
export class DataStack extends cdk.Stack {
  readonly table: dynamodb.TableV2;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.TableV2(this, "AppTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "expiresAt",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billing: dynamodb.Billing.onDemand(),
      globalSecondaryIndexes: [
        {
          indexName: "gsi1",
          partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
          sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
        },
      ],
    });

    new cdk.CfnOutput(this, "TableName", { value: this.table.tableName });
  }
}

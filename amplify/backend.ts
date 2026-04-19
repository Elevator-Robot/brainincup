import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { brain } from './functions/brain/resource';
import { PolicyStatement, Effect, ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { EventSourceMapping, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { Tags, CfnResource, CfnOutput } from 'aws-cdk-lib';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as aws_logs from 'aws-cdk-lib/aws-logs';
import * as aws_s3 from 'aws-cdk-lib/aws-s3';
import * as aws_cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as aws_cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as aws_sns from 'aws-cdk-lib/aws-sns';
import * as aws_iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Duration } from 'aws-cdk-lib';

const readAgentCoreConfigFile = (): Record<string, string> => {
  const fileDir = dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    resolve(process.cwd(), '.env.agentcore'),
    resolve(fileDir, '../.env.agentcore'),
  ];

  const filePath = candidatePaths.find((candidate) => existsSync(candidate));
  if (!filePath) {
    return {};
  }

  const values: Record<string, string> = {};
  const lines = readFileSync(filePath, 'utf-8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');
    if (key) {
      values[key] = value;
    }
  }

  return values;
};

const agentCoreConfigFileValues = readAgentCoreConfigFile();
const getAgentCoreConfig = (key: string): string | undefined => {
  const value = process.env[key] ?? agentCoreConfigFileValues[key];
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const VALID_RETENTION_DAYS = new Set([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653]);

export const getValidRetentionDays = (value: string | undefined): number => {
  if (value === undefined) {
    return 30;
  }
  const parsed = Number(value);
  if (!VALID_RETENTION_DAYS.has(parsed)) {
    const validValues = [...VALID_RETENTION_DAYS].join(', ');
    throw new Error(`Invalid OBSERVABILITY_LOG_RETENTION_DAYS value: ${value}. Must be one of: ${validValues}`);
  }
  return parsed;
};

interface ObservabilityConfig {
  invocationLoggingEnabled: boolean;   // default: true
  agentcoreEnabled: boolean;           // default: true
  logRetentionDays: number;            // default: 30, must be in CloudWatch valid set
  s3BucketName?: string;               // optional
  alarmSnsArn?: string;                // optional
}

const buildObservabilityConfig = (getConfig: (key: string) => string | undefined): ObservabilityConfig => {
  const invocationLoggingEnabled = getConfig('OBSERVABILITY_INVOCATION_LOGGING_ENABLED') !== 'false';
  const agentcoreEnabled = getConfig('OBSERVABILITY_AGENTCORE_ENABLED') !== 'false';
  const logRetentionDays = getValidRetentionDays(getConfig('OBSERVABILITY_LOG_RETENTION_DAYS'));
  const s3BucketName = getConfig('BEDROCK_INVOCATION_LOG_S3_BUCKET');
  const alarmSnsArn = getConfig('OBSERVABILITY_ALARM_SNS_ARN');
  return { invocationLoggingEnabled, agentcoreEnabled, logRetentionDays, s3BucketName, alarmSnsArn };
};

const backend = defineBackend({
  auth,
  data,
  brain,
});

const stack = backend.stack;

// ─── Observability Infrastructure ────────────────────────────────────────────
const obsConfig = buildObservabilityConfig(getAgentCoreConfig);

const sanitizeRuntimeName = (value: string) => {
  const stripped = value.replace(/[^A-Za-z0-9_]/g, '') || 'BrainAgentRuntime';
  const prefixed = /^[A-Za-z]/.test(stripped) ? stripped : `Brain${stripped}`;
  return prefixed.slice(0, 48);
};

// Add tags to all resources in the stack
Tags.of(stack).add('Project', 'BrainInCup');
Tags.of(stack).add('Environment', stack.stackName.includes('sandbox') ? 'development' : 'production');
Tags.of(stack).add('ManagedBy', 'Amplify');

const { cfnResources } = backend.data.resources;
cfnResources.amplifyDynamoDbTables['Message'].streamSpecification = {
  streamViewType: StreamViewType.NEW_AND_OLD_IMAGES,
};

const conversationTable = backend.data.resources.tables['Conversation'];
const messageTable = backend.data.resources.tables['Message'];
const responseTable = backend.data.resources.tables['BrainResponse'];
const characterTable = backend.data.resources.tables['GameMasterCharacter'];
const questStepTable = backend.data.resources.tables['GameMasterQuestStep'];
const adventureTable = backend.data.resources.tables['GameMasterAdventure'];

const brainLambda = backend.brain.resources.lambda as import('aws-cdk-lib').aws_lambda.Function;

// Add Function URL to make the Lambda publicly accessible
const functionUrl = brainLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ['*'],
    allowedMethods: [HttpMethod.ALL],
    allowedHeaders: ['*'],
  },
});

brainLambda.addEnvironment('CONVERSATION_TABLE_NAME', conversationTable.tableName);
brainLambda.addEnvironment('MESSAGE_TABLE_NAME', messageTable.tableName);
brainLambda.addEnvironment('RESPONSE_TABLE_NAME', responseTable.tableName);
brainLambda.addEnvironment('CHARACTER_TABLE_NAME', characterTable.tableName);
brainLambda.addEnvironment('QUEST_STEP_TABLE_NAME', questStepTable.tableName);
brainLambda.addEnvironment('ADVENTURE_TABLE_NAME', adventureTable.tableName);
brainLambda.addEnvironment('APPSYNC_API_URL', backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlUrl);
brainLambda.addEnvironment('AWS_REGION_NAME', stack.region);

const agentcoreContainerUri = getAgentCoreConfig('AGENTCORE_CONTAINER_URI');
// Generate unique runtime name based on stack name and account to avoid conflicts
const baseRuntimeName = sanitizeRuntimeName(stack.stackName);
const defaultRuntimeName = `${baseRuntimeName}-${stack.account.slice(-4)}`;
const requestedRuntimeName = getAgentCoreConfig('AGENTCORE_RUNTIME_NAME') ?? defaultRuntimeName;
let agentcoreRuntimeArn = getAgentCoreConfig('AGENTCORE_RUNTIME_ARN');

// If no ARN is provided, require container URI to create runtime
if (!agentcoreRuntimeArn) {
  if (!agentcoreContainerUri) {
    throw new Error(
      'AgentCore runtime is required. Please provide either:\n' +
      '  - AGENTCORE_RUNTIME_ARN (existing runtime ARN)\n' +
      '  - AGENTCORE_CONTAINER_URI (to create new runtime)\n' +
      'See docs/archive/AGENTCORE_RUNTIME_SETUP.md for setup instructions.'
    );
  }

  // Create the runtime since ARN wasn't provided
  const agentcoreRuntimeRole = new Role(stack, 'AgentCoreRuntimeRole', {
    assumedBy: new ServicePrincipal('bedrock-agentcore.amazonaws.com'),
    description: 'Execution role for Amazon Bedrock AgentCore runtime',
  });
  agentcoreRuntimeRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'));
  agentcoreRuntimeRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'));
  
  // Add CloudWatch Logs permissions for runtime logging
  agentcoreRuntimeRole.addToPolicy(new PolicyStatement({
    actions: [
      'logs:CreateLogGroup',
      'logs:CreateLogStream',
      'logs:PutLogEvents',
    ],
    resources: [
      `arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/bedrock-agentcore/runtimes/*`,
    ],
    effect: Effect.ALLOW,
  }));

  const runtimeResource = new CfnResource(stack, 'AgentCoreRuntime', {
    type: 'AWS::BedrockAgentCore::Runtime',
    properties: {
      AgentRuntimeName: sanitizeRuntimeName(requestedRuntimeName),
      AgentRuntimeArtifact: {
        ContainerConfiguration: {
          ContainerUri: agentcoreContainerUri,
        },
      },
      NetworkConfiguration: {
        NetworkMode: getAgentCoreConfig('AGENTCORE_NETWORK_MODE') ?? 'PUBLIC',
      },
      EnvironmentVariables: {
        LOG_LEVEL: getAgentCoreConfig('AGENTCORE_RUNTIME_LOG_LEVEL') ?? 'INFO',
        AWS_REGION: stack.region,
        OTEL_SERVICE_NAME: getAgentCoreConfig('OTEL_SERVICE_NAME') ?? 'brain-in-cup-agentcore-runtime',
        OTEL_PROPAGATORS: getAgentCoreConfig('OTEL_PROPAGATORS') ?? 'xray,tracecontext,baggage',
        // AgentCore OTEL observability env vars (Requirement 4.2)
        AGENT_OBSERVABILITY_ENABLED: obsConfig.agentcoreEnabled ? 'true' : 'false',
        OTEL_PYTHON_DISTRO: 'aws_distro',
        OTEL_PYTHON_CONFIGURATOR: 'aws_configurator',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
        OTEL_RESOURCE_ATTRIBUTES: 'service.name=brain-in-cup-agentcore-runtime',
      },
      RoleArn: agentcoreRuntimeRole.roleArn,
      Description: 'Amazon Bedrock AgentCore runtime managed by Amplify Gen2 backend',
      Tags: {
        Project: 'BrainInCup',
        ManagedBy: 'Amplify',
      },
    },
  });

  agentcoreRuntimeArn = runtimeResource.getAtt('AgentRuntimeArn').toString();

  new CfnOutput(stack, 'AgentCoreRuntimeArn', {
    value: agentcoreRuntimeArn,
    description: 'ARN of the provisioned Amazon Bedrock AgentCore runtime',
  });
}

// Now agentcoreRuntimeArn is guaranteed to be set
brainLambda.addEnvironment('AGENTCORE_RUNTIME_ARN', agentcoreRuntimeArn);
brainLambda.addEnvironment('AGENTCORE_TRACE_ENABLED', getAgentCoreConfig('AGENTCORE_TRACE_ENABLED') ?? 'true');
brainLambda.addEnvironment('AGENTCORE_TRACE_SAMPLE_RATE', getAgentCoreConfig('AGENTCORE_TRACE_SAMPLE_RATE') ?? '1.0');
const agentcoreMemoryId = getAgentCoreConfig('AGENTCORE_MEMORY_ID');
if (agentcoreMemoryId) {
  brainLambda.addEnvironment('AGENTCORE_MEMORY_ID', agentcoreMemoryId);
}
const agentcoreMemorySemanticStrategyId = getAgentCoreConfig('AGENTCORE_MEMORY_SEMANTIC_STRATEGY_ID');
if (agentcoreMemorySemanticStrategyId) {
  brainLambda.addEnvironment('AGENTCORE_MEMORY_SEMANTIC_STRATEGY_ID', agentcoreMemorySemanticStrategyId);
}
const agentcoreMemoryStrategyId = getAgentCoreConfig('AGENTCORE_MEMORY_STRATEGY_ID');
if (agentcoreMemoryStrategyId) {
  brainLambda.addEnvironment('AGENTCORE_MEMORY_STRATEGY_ID', agentcoreMemoryStrategyId);
}
const agentcoreMemoryCharacterStrategyId = getAgentCoreConfig('AGENTCORE_MEMORY_CHARACTER_STRATEGY_ID');
if (agentcoreMemoryCharacterStrategyId) {
  brainLambda.addEnvironment('AGENTCORE_MEMORY_CHARACTER_STRATEGY_ID', agentcoreMemoryCharacterStrategyId);
}
const agentcoreMemoryResource = agentcoreMemoryId
  ? `arn:aws:bedrock-agentcore:${stack.region}:${stack.account}:memory/${agentcoreMemoryId}`
  : '*';

// Note: Layer is already defined in amplify/functions/brain/resource.ts

new EventSourceMapping(stack, 'BrainMessageMapping', {
  target: brainLambda,
  eventSourceArn: messageTable.tableStreamArn,
  startingPosition: StartingPosition.LATEST,
});

brainLambda.addToRolePolicy(new PolicyStatement({
  actions: ['bedrock-agentcore:InvokeAgentRuntime', 'bedrock-agentcore:InvokeAgentRuntimeForUser'],
  resources: agentcoreRuntimeArn ? [
    agentcoreRuntimeArn,
    `${agentcoreRuntimeArn}/*`,
  ] : ['*'],
  effect: Effect.ALLOW,
}));

brainLambda.addToRolePolicy(new PolicyStatement({
  actions: [
    'bedrock-agentcore:CreateEvent',
    'bedrock-agentcore:RetrieveMemoryRecords',
    'bedrock-agentcore:BatchCreateMemoryRecords',
  ],
  resources: [agentcoreMemoryResource],
  effect: Effect.ALLOW,
}));

brainLambda.addToRolePolicy(new PolicyStatement({
  actions: [
    'dynamodb:DescribeStream',
    'dynamodb:GetRecords',
    'dynamodb:GetShardIterator',
    'dynamodb:ListStreams',
    'dynamodb:ListTables',
    'dynamodb:DescribeTable',
    'dynamodb:Query',
    'dynamodb:Scan',
    'dynamodb:GetItem',
    'dynamodb:PutItem',
    'dynamodb:UpdateItem',
  ],
  resources: [
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${conversationTable.tableName}`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${conversationTable.tableName}/*`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${messageTable.tableName}`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${messageTable.tableName}/*`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${responseTable.tableName}`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${responseTable.tableName}/*`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${characterTable.tableName}`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${characterTable.tableName}/*`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${questStepTable.tableName}`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${questStepTable.tableName}/*`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${adventureTable.tableName}`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${adventureTable.tableName}/*`
  ],
  effect: Effect.ALLOW,
}));
brainLambda.addToRolePolicy(new PolicyStatement({
  actions: ['appsync:GraphQL'],
  resources: [
    `arn:aws:appsync:${stack.region}:${stack.account}:apis/${backend.data.resources.cfnResources.cfnGraphqlApi.attrApiId}/types/*`,
  ],
  effect: Effect.ALLOW,
}));

// Add Lambda function URL to outputs so frontend can call it
backend.addOutput({
  custom: {
    brainApiUrl: functionUrl.url,
  },
});

// ─── Observability Infrastructure ────────────────────────────────────────────
if (obsConfig.invocationLoggingEnabled) {
  // CloudWatch Log Group for Bedrock invocation logs
  const bedrockLogGroup = new aws_logs.LogGroup(stack, 'BedrockInvocationLogGroup', {
    logGroupName: `/aws/bedrock/invocations/${stack.stackName}`,
    retention: obsConfig.logRetentionDays as aws_logs.RetentionDays,
  });
  Tags.of(bedrockLogGroup).add('DataClassification', 'GameContent');
  Tags.of(bedrockLogGroup).add('RetentionPolicy', '30days');

  // IAM Role for Bedrock to write to CloudWatch Logs
  const bedrockLoggingRole = new aws_iam.Role(stack, 'BedrockLoggingRole', {
    assumedBy: new aws_iam.ServicePrincipal('bedrock.amazonaws.com'),
    description: 'IAM role for Bedrock model invocation logging to CloudWatch',
  });
  bedrockLoggingRole.addToPolicy(new aws_iam.PolicyStatement({
    actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
    resources: [bedrockLogGroup.logGroupArn],
    effect: Effect.ALLOW,
  }));

  // Optional S3 bucket for large payloads
  let s3Config: object | undefined;
  if (obsConfig.s3BucketName) {
    const invocationBucket = new aws_s3.Bucket(stack, 'BedrockInvocationBucket', {
      bucketName: obsConfig.s3BucketName,
    });
    Tags.of(invocationBucket).add('DataClassification', 'GameContent');
    Tags.of(invocationBucket).add('RetentionPolicy', '30days');
    s3Config = {
      bucketName: invocationBucket.bucketName,
      keyPrefix: 'data/',
    };
  }

  // Configure Bedrock model invocation logging via the Bedrock API (not a native CFN resource type)
  const loggingConfig: Record<string, unknown> = {
    textDataDeliveryEnabled: true,
    cloudWatchConfig: {
      logGroupName: bedrockLogGroup.logGroupName,
      roleArn: bedrockLoggingRole.roleArn,
    },
    ...(s3Config ? { s3Config } : {}),
  };

  new cr.AwsCustomResource(stack, 'BedrockModelInvocationLogging', {
    onCreate: {
      service: 'Bedrock',
      action: 'putModelInvocationLoggingConfiguration',
      parameters: { loggingConfig },
      physicalResourceId: cr.PhysicalResourceId.of(`BedrockInvocationLogging-${stack.stackName}`),
    },
    onUpdate: {
      service: 'Bedrock',
      action: 'putModelInvocationLoggingConfiguration',
      parameters: { loggingConfig },
      physicalResourceId: cr.PhysicalResourceId.of(`BedrockInvocationLogging-${stack.stackName}`),
    },
    onDelete: {
      service: 'Bedrock',
      action: 'deleteModelInvocationLoggingConfiguration',
      parameters: {},
      physicalResourceId: cr.PhysicalResourceId.of(`BedrockInvocationLogging-${stack.stackName}`),
    },
    policy: cr.AwsCustomResourcePolicy.fromStatements([
      new aws_iam.PolicyStatement({
        actions: [
          'bedrock:PutModelInvocationLoggingConfiguration',
          'bedrock:DeleteModelInvocationLoggingConfiguration',
        ],
        resources: ['*'],
        effect: Effect.ALLOW,
      }),
      new aws_iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [bedrockLoggingRole.roleArn],
        effect: Effect.ALLOW,
      }),
    ]),
  });
}

// Enable CloudWatch Transaction Search (X-Ray prerequisite for GenAI Observability)
new cr.AwsCustomResource(stack, 'TransactionSearchResourcePolicy', {
  onCreate: {
    service: 'CloudWatchLogs',
    action: 'putResourcePolicy',
    parameters: {
      policyName: `TransactionSearchPolicy-${stack.stackName}`,
      policyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowXRayToWriteSpans',
            Effect: 'Allow',
            Principal: { Service: 'xray.amazonaws.com' },
            Action: 'logs:PutLogEvents',
            Resource: [
              `arn:aws:logs:${stack.region}:${stack.account}:log-group:aws/spans:*`,
              `arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/application-signals/data:*`,
            ],
          },
        ],
      }),
    },
    physicalResourceId: cr.PhysicalResourceId.of(`TransactionSearchPolicy-${stack.stackName}`),
  },
  onDelete: {
    service: 'CloudWatchLogs',
    action: 'deleteResourcePolicy',
    parameters: {
      policyName: `TransactionSearchPolicy-${stack.stackName}`,
    },
  },
  policy: cr.AwsCustomResourcePolicy.fromStatements([
    new aws_iam.PolicyStatement({
      actions: ['logs:PutResourcePolicy', 'logs:DeleteResourcePolicy'],
      resources: ['*'],
      effect: Effect.ALLOW,
    }),
  ]),
});

// ─── CloudWatch Alarms ────────────────────────────────────────────────────────

// Alarm: InvocationErrors > 5 in 5 minutes (bedrock-agentcore namespace)
const invocationErrorsAlarm = new aws_cloudwatch.Alarm(stack, 'BedrockAgentCoreInvocationErrorsAlarm', {
  alarmName: `BrainInCup-${stack.stackName}-InvocationErrors`,
  alarmDescription: 'AgentCore invocation error rate exceeded threshold',
  metric: new aws_cloudwatch.Metric({
    namespace: 'bedrock-agentcore',
    metricName: 'InvocationErrors',
    period: Duration.minutes(5),
    statistic: 'Sum',
  }),
  threshold: 5,
  evaluationPeriods: 1,
  comparisonOperator: aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: aws_cloudwatch.TreatMissingData.NOT_BREACHING,
});

// Alarm: InvocationLatency p99 > 30000 ms in 5 minutes (AWS/Bedrock namespace)
const invocationLatencyAlarm = new aws_cloudwatch.Alarm(stack, 'BedrockInvocationLatencyAlarm', {
  alarmName: `BrainInCup-${stack.stackName}-InvocationLatency-p99`,
  alarmDescription: 'Bedrock invocation latency p99 exceeded 30 seconds',
  metric: new aws_cloudwatch.Metric({
    namespace: 'AWS/Bedrock',
    metricName: 'InvocationLatency',
    period: Duration.minutes(5),
    statistic: 'p99',
  }),
  threshold: 30000,
  evaluationPeriods: 1,
  comparisonOperator: aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: aws_cloudwatch.TreatMissingData.NOT_BREACHING,
});

// Add SNS action if configured
if (obsConfig.alarmSnsArn) {
  const snsAction = new aws_cloudwatch_actions.SnsAction(
    aws_sns.Topic.fromTopicArn(stack, 'ObservabilityAlarmTopic', obsConfig.alarmSnsArn)
  );
  invocationErrorsAlarm.addAlarmAction(snsAction);
  invocationLatencyAlarm.addAlarmAction(snsAction);
} else {
  // Emit alarm ARNs as output when no SNS topic is configured
  new CfnOutput(stack, 'ObservabilityAlarmArns', {
    value: [invocationErrorsAlarm.alarmArn, invocationLatencyAlarm.alarmArn].join(','),
    description: 'CloudWatch alarm ARNs for Bedrock observability (configure OBSERVABILITY_ALARM_SNS_ARN to add SNS notifications)',
  });
}

// ─── CloudWatch Dashboard ─────────────────────────────────────────────────────
const dashboard = new aws_cloudwatch.Dashboard(stack, 'BrainInCupDashboard', {
  dashboardName: `BrainInCup-${stack.stackName}`,
});

// Row 1: Lambda metrics
dashboard.addWidgets(
  new aws_cloudwatch.GraphWidget({
    title: 'Lambda Invocations',
    left: [new aws_cloudwatch.Metric({ namespace: 'AWS/Lambda', metricName: 'Invocations', dimensionsMap: { FunctionName: brainLambda.functionName }, statistic: 'Sum', period: Duration.minutes(5) })],
  }),
  new aws_cloudwatch.GraphWidget({
    title: 'Lambda Errors',
    left: [new aws_cloudwatch.Metric({ namespace: 'AWS/Lambda', metricName: 'Errors', dimensionsMap: { FunctionName: brainLambda.functionName }, statistic: 'Sum', period: Duration.minutes(5) })],
  }),
  new aws_cloudwatch.GraphWidget({
    title: 'Lambda Duration (p99)',
    left: [new aws_cloudwatch.Metric({ namespace: 'AWS/Lambda', metricName: 'Duration', dimensionsMap: { FunctionName: brainLambda.functionName }, statistic: 'p99', period: Duration.minutes(5) })],
  }),
);

// Row 2: DynamoDB metrics
dashboard.addWidgets(
  new aws_cloudwatch.GraphWidget({
    title: 'DynamoDB ThrottledRequests',
    left: [
      new aws_cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ThrottledRequests', dimensionsMap: { TableName: messageTable.tableName }, statistic: 'Sum', period: Duration.minutes(5) }),
      new aws_cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ThrottledRequests', dimensionsMap: { TableName: conversationTable.tableName }, statistic: 'Sum', period: Duration.minutes(5) }),
      new aws_cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ThrottledRequests', dimensionsMap: { TableName: responseTable.tableName }, statistic: 'Sum', period: Duration.minutes(5) }),
    ],
  }),
  new aws_cloudwatch.GraphWidget({
    title: 'DynamoDB Consumed Read Capacity',
    left: [
      new aws_cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ConsumedReadCapacityUnits', dimensionsMap: { TableName: messageTable.tableName }, statistic: 'Sum', period: Duration.minutes(5) }),
      new aws_cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ConsumedReadCapacityUnits', dimensionsMap: { TableName: conversationTable.tableName }, statistic: 'Sum', period: Duration.minutes(5) }),
      new aws_cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ConsumedReadCapacityUnits', dimensionsMap: { TableName: responseTable.tableName }, statistic: 'Sum', period: Duration.minutes(5) }),
    ],
  }),
  new aws_cloudwatch.GraphWidget({
    title: 'DynamoDB Consumed Write Capacity',
    left: [
      new aws_cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ConsumedWriteCapacityUnits', dimensionsMap: { TableName: messageTable.tableName }, statistic: 'Sum', period: Duration.minutes(5) }),
      new aws_cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ConsumedWriteCapacityUnits', dimensionsMap: { TableName: conversationTable.tableName }, statistic: 'Sum', period: Duration.minutes(5) }),
      new aws_cloudwatch.Metric({ namespace: 'AWS/DynamoDB', metricName: 'ConsumedWriteCapacityUnits', dimensionsMap: { TableName: responseTable.tableName }, statistic: 'Sum', period: Duration.minutes(5) }),
    ],
  }),
);

// Row 3: AppSync metrics
const graphqlApiId = backend.data.resources.cfnResources.cfnGraphqlApi.attrApiId;
dashboard.addWidgets(
  new aws_cloudwatch.GraphWidget({
    title: 'AppSync Latency',
    left: [new aws_cloudwatch.Metric({ namespace: 'AWS/AppSync', metricName: 'Latency', dimensionsMap: { GraphQLAPIId: graphqlApiId }, statistic: 'p99', period: Duration.minutes(5) })],
  }),
  new aws_cloudwatch.GraphWidget({
    title: 'AppSync 5XX Errors',
    left: [new aws_cloudwatch.Metric({ namespace: 'AWS/AppSync', metricName: '5XXError', dimensionsMap: { GraphQLAPIId: graphqlApiId }, statistic: 'Sum', period: Duration.minutes(5) })],
  }),
  new aws_cloudwatch.GraphWidget({
    title: 'AppSync 4XX Errors',
    left: [new aws_cloudwatch.Metric({ namespace: 'AWS/AppSync', metricName: '4XXError', dimensionsMap: { GraphQLAPIId: graphqlApiId }, statistic: 'Sum', period: Duration.minutes(5) })],
  }),
);

// Row 4: Bedrock metrics
dashboard.addWidgets(
  new aws_cloudwatch.GraphWidget({
    title: 'Bedrock Invocations',
    left: [new aws_cloudwatch.Metric({ namespace: 'AWS/Bedrock', metricName: 'Invocations', statistic: 'Sum', period: Duration.minutes(5) })],
  }),
  new aws_cloudwatch.GraphWidget({
    title: 'Bedrock Invocation Latency',
    left: [new aws_cloudwatch.Metric({ namespace: 'AWS/Bedrock', metricName: 'InvocationLatency', statistic: 'p99', period: Duration.minutes(5) })],
  }),
  new aws_cloudwatch.GraphWidget({
    title: 'AgentCore Invocation Errors',
    left: [new aws_cloudwatch.Metric({ namespace: 'bedrock-agentcore', metricName: 'InvocationErrors', statistic: 'Sum', period: Duration.minutes(5) })],
  }),
);

new CfnOutput(stack, 'ObservabilityDashboardUrl', {
  value: `https://${stack.region}.console.aws.amazon.com/cloudwatch/home?region=${stack.region}#dashboards:name=BrainInCup-${stack.stackName}`,
  description: 'CloudWatch Dashboard URL for Brain in Cup observability',
});

export default backend;

import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { brain } from './functions/brain/resource';
import { PolicyStatement, Effect, ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { EventSourceMapping, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { Tags, CfnResource, CfnOutput } from 'aws-cdk-lib';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const backend = defineBackend({
  auth,
  data,
  brain,
});

const stack = backend.stack;

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

const brainLambda = backend.brain.resources.lambda as import('aws-cdk-lib').aws_lambda.Function;
brainLambda.addEnvironment('CONVERSATION_TABLE_NAME', conversationTable.tableName);
brainLambda.addEnvironment('MESSAGE_TABLE_NAME', messageTable.tableName);
brainLambda.addEnvironment('RESPONSE_TABLE_NAME', responseTable.tableName);
brainLambda.addEnvironment('CHARACTER_TABLE_NAME', characterTable.tableName);
brainLambda.addEnvironment('QUEST_STEP_TABLE_NAME', questStepTable.tableName);
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
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${questStepTable.tableName}/*`
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
    brainApiUrl: brainLambda.url,
  },
});

export default backend;

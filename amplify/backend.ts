import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { brain } from './functions/brain/resource';
import { PolicyStatement, Effect, ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { EventSourceMapping, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { Tags, CfnResource, CfnOutput } from 'aws-cdk-lib';

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

const brainLambda = backend.brain.resources.lambda as import('aws-cdk-lib').aws_lambda.Function;
brainLambda.addEnvironment('CONVERSATION_TABLE_NAME', conversationTable.tableName);
brainLambda.addEnvironment('MESSAGE_TABLE_NAME', messageTable.tableName);
brainLambda.addEnvironment('RESPONSE_TABLE_NAME', responseTable.tableName);
brainLambda.addEnvironment('APPSYNC_API_URL', backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlUrl);
brainLambda.addEnvironment('AWS_REGION_NAME', stack.region);

const agentcoreContainerUri = process.env.AGENTCORE_CONTAINER_URI;
const requestedRuntimeName = process.env.AGENTCORE_RUNTIME_NAME ?? `Brain${stack.stackName}Runtime`;
let agentcoreRuntimeArn = process.env.AGENTCORE_RUNTIME_ARN;

if (agentcoreContainerUri) {
  const agentcoreRuntimeRole = new Role(stack, 'AgentCoreRuntimeRole', {
    assumedBy: new ServicePrincipal('bedrock.amazonaws.com'),
    description: 'Execution role for Amazon Bedrock AgentCore runtime',
  });
  agentcoreRuntimeRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'));
  agentcoreRuntimeRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'));

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
        NetworkMode: process.env.AGENTCORE_NETWORK_MODE ?? 'PUBLIC',
      },
      EnvironmentVariables: {
        LOG_LEVEL: process.env.AGENTCORE_RUNTIME_LOG_LEVEL ?? 'INFO',
      },
      RoleArn: agentcoreRuntimeRole.roleArn,
      Description: 'Amazon Bedrock AgentCore runtime managed by Amplify Gen2 backend',
      Tags: [
        { Key: 'Project', Value: 'BrainInCup' },
        { Key: 'ManagedBy', Value: 'Amplify' },
      ],
    },
  });

  agentcoreRuntimeArn = runtimeResource.getAtt('AgentRuntimeArn').toString();

  new CfnOutput(stack, 'AgentCoreRuntimeArn', {
    value: agentcoreRuntimeArn,
    description: 'ARN of the provisioned Amazon Bedrock AgentCore runtime',
  });
}

brainLambda.addEnvironment('AGENTCORE_RUNTIME_ARN', agentcoreRuntimeArn ?? '');
brainLambda.addEnvironment('AGENTCORE_TRACE_ENABLED', process.env.AGENTCORE_TRACE_ENABLED ?? 'false');
brainLambda.addEnvironment('AGENTCORE_TRACE_SAMPLE_RATE', process.env.AGENTCORE_TRACE_SAMPLE_RATE ?? '0');

// Note: Layer is already defined in amplify/functions/brain/resource.ts

new EventSourceMapping(stack, 'BrainMessageMapping', {
  target: brainLambda,
  eventSourceArn: messageTable.tableStreamArn,
  startingPosition: StartingPosition.LATEST,
});

brainLambda.addToRolePolicy(new PolicyStatement({
  actions: ['bedrock-agentcore:InvokeAgentRuntime'],
  resources: [agentcoreRuntimeArn ?? '*'],
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
    'dynamodb:GetItem',
    'dynamodb:PutItem',
  ],
  resources: [
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${conversationTable.tableName}`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${conversationTable.tableName}/*`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${messageTable.tableName}`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${messageTable.tableName}/*`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${responseTable.tableName}`,
    `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${responseTable.tableName}/*`
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

export default backend;


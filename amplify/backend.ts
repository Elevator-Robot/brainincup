import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { brain } from './functions/brain/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { EventSourceMapping, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { Tags } from 'aws-cdk-lib';

const backend = defineBackend({
  auth,
  data,
  brain,
});

const stack = backend.stack;

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

// Note: Layer is already defined in amplify/functions/brain/resource.ts

new EventSourceMapping(stack, 'BrainMessageMapping', {
  target: brainLambda,
  eventSourceArn: messageTable.tableStreamArn,
  startingPosition: StartingPosition.LATEST,
});

brainLambda.addToRolePolicy(new PolicyStatement({
  actions: ['bedrock:*'],
  resources: ['*'],
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


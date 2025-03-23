import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { brain } from './functions/brain/resource';
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam"
import { EventSourceMapping, StartingPosition, LayerVersion, Code, Runtime } from 'aws-cdk-lib/aws-lambda';

const backend = defineBackend({
  auth,
  data,
  brain,
});

const stack = backend.stack;

const { cfnResources } = backend.data.resources;
cfnResources.amplifyDynamoDbTables['Message'].streamSpecification = {
  streamViewType: 'NEW_AND_OLD_IMAGES' as any,
}

const messageTable = backend.data.resources.tables['Message'];

const brainLambda = backend.brain.resources.lambda;

// const layer = new LayerVersion(stack, 'BrainDepsLayer', { # TODO: this creates the new layer successfully, but I need to get it working with the lambda function so that it can be attached to the lambda function
//   code: Code.fromAsset('amplify/functions/brain/layer/python.zip'),
//   compatibleRuntimes: [Runtime.PYTHON_3_13],
// });

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
  ],
  resources: [messageTable.tableStreamArn as string],
  effect: Effect.ALLOW,
}));

export default backend;


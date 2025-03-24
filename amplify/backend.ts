import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { brain } from './functions/brain/resource';
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam"
import { EventSourceMapping, StartingPosition, LayerVersion, Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import * as lambda from 'aws-cdk-lib/aws-lambda';

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

const brainLambda = backend.brain.resources.lambda as lambda.Function;

const layer = new LayerVersion(stack, 'BrainDepsLayer', {
  code: Code.fromAsset('amplify/functions/brain/layer', {
    bundling: {
      image: Runtime.PYTHON_3_13.bundlingImage,
      command: [
        'bash',
        '-c',
        'pip install -r requirements.txt -t /asset-output'
      ],
    },
  }),
  compatibleRuntimes: [Runtime.PYTHON_3_13],
});

brainLambda.addLayers(layer);

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


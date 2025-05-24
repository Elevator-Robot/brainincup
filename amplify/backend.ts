import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { brain } from './functions/brain/resource';
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam"
import { EventSourceMapping, StartingPosition, LayerVersion, Code, Runtime, Function } from 'aws-cdk-lib/aws-lambda';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { DockerImage } from 'aws-cdk-lib';

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

const conversationTable = backend.data.resources.tables['Conversation'];
const messageTable = backend.data.resources.tables['Message'];
const responseTable = backend.data.resources.tables['BrainResponse'];

const brainLambda = backend.brain.resources.lambda as Function;
brainLambda.addEnvironment('CONVERSATION_TABLE_NAME', conversationTable.tableName);
brainLambda.addEnvironment('MESSAGE_TABLE_NAME', messageTable.tableName);
brainLambda.addEnvironment('RESPONSE_TABLE_NAME', responseTable.tableName);
brainLambda.addEnvironment('APPSYNC_API_URL', backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlUrl);

const layer = new LayerVersion(stack, 'BrainDepsLayer', {
  code: Code.fromAsset('amplify/functions/brain/layer', {
    bundling: {
      // Try local bundling first (no Docker)
      local: {
        tryBundle(outputDir: string) {
          try {
            // Copy all source files into the asset output dir
            fs.copySync('amplify/functions/brain/layer', outputDir);

            // Install Python dependencies directly into the layer folder
            // (creates a "python" subfolder per Lambda layer conventions)
            execSync(
              'pip install --platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all: -r requirements.txt -t python',
              { cwd: outputDir }
            );

            return true;
          } catch (error) {
            console.error('Local bundling failed:', error);
            return false;
          }
        }
      },
      // Use a default Docker image if local bundling fails
      image: DockerImage.fromRegistry('public.ecr.aws/sam/build-python3.12:latest'),
      command: [
        'bash',
        '-c',
        'pip install --platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all: -r requirements.txt -t /asset-output/python'
      ],
    }
  }),
  compatibleRuntimes: [Runtime.PYTHON_3_12],
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
    'dynamodb:ListTables',
    'dynamodb:DescribeTable',
    'dynamodb:Query',
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

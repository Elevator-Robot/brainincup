import { defineFunction } from '@aws-amplify/backend';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';

export const brain = defineFunction((scope) => {
  return new Function(scope, 'BrainFunction', {
    runtime: Runtime.PYTHON_3_13,
    handler: 'handler.main',
    code: Code.fromAsset('amplify/functions/brain/src'),
    timeout: Duration.seconds(30),
  });
});


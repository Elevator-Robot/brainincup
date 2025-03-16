import { defineFunction } from '@aws-amplify/backend';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';

export const brain = defineFunction((scope) => {
  return new Function(scope, 'BrainFunction', {
    runtime: Runtime.PYTHON_3_13, // Specify the Python runtime version
    handler: 'handler.main',     // The handler method in your Python code
    code: Code.fromAsset('amplify/functions/brain/src'), // Path to your Python code
    timeout: Duration.seconds(30), // Optional: specify the timeout duration
  });
});


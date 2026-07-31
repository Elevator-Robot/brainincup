import { defineFunction } from '@aws-amplify/backend';
import { Function, Runtime, Code, LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { Duration, Fn, IgnoreMode } from 'aws-cdk-lib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const brain = defineFunction((scope) => {
  // Create the Lambda layer with dependencies
  const dependenciesLayer = new LayerVersion(scope, 'BrainDependenciesLayer', {
    code: Code.fromAsset(join(__dirname, 'layer'), {
      ignoreMode: IgnoreMode.GLOB,
      exclude: ['requirements.txt']
    }),
    compatibleRuntimes: [Runtime.PYTHON_3_12],
    description: 'Dependencies for Brain function including AWS SDK tooling',
  });

  // Lambda Web Adapter runs the Python web server so the Lambda Function URL
  // can stream SSE responses (managed Python runtimes cannot stream natively).
  const lambdaWebAdapterLayer = LayerVersion.fromLayerVersionArn(
    scope,
    'LambdaWebAdapterLayer',
    Fn.sub('arn:aws:lambda:${AWS::Region}:753240598075:layer:LambdaAdapterLayerX86:28'),
  );

  return new Function(scope, 'BrainFunction', {
    runtime: Runtime.PYTHON_3_12,
    handler: 'run.sh',
    code: Code.fromAsset(join(__dirname, 'src')),
    timeout: Duration.seconds(300),
    layers: [dependenciesLayer, lambdaWebAdapterLayer],
    environment: {
      AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
      AWS_LWA_INVOKE_MODE: 'response_stream',
      AWS_LWA_PORT: '8080',
    },
  });
});


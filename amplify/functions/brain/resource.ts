import { defineFunction } from '@aws-amplify/backend';
import { Function, Runtime, Code, LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { IgnoreMode } from 'aws-cdk-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const brain = defineFunction((scope) => {
  // Create the Lambda layer with dependencies
  // Note: The layer/python directory contains pip-installed packages
  // Run ./build-layer.sh before deploying to build the layer
  const dependenciesLayer = new LayerVersion(scope, 'BrainDependenciesLayer', {
    code: Code.fromAsset(join(__dirname, 'layer'), {
      // Use GLOB mode to ignore .gitignore and only use explicit exclude patterns
      ignoreMode: IgnoreMode.GLOB,
      exclude: ['requirements.txt']
    }),
    compatibleRuntimes: [Runtime.PYTHON_3_12],
    description: 'Dependencies for Brain function including AWS SDK tooling',
  });

  return new Function(scope, 'BrainFunction', {
    runtime: Runtime.PYTHON_3_12,
    handler: 'handler.main',
    code: Code.fromAsset(join(__dirname, 'src')),
    timeout: Duration.seconds(60),
    layers: [dependenciesLayer],
  });
});


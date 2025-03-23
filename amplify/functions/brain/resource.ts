import { defineFunction } from '@aws-amplify/backend';
import { Function, Runtime, Code, LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const layerPath = path.join(__dirname, 'layer/python.zip');
console.log('Layer path:', layerPath);

export const brain = defineFunction((scope) => {
  // Create a Lambda layer for Python dependencies.
  const brainDepsLayer = new LayerVersion(scope, 'BrainDepsLayer', {
    compatibleRuntimes: [Runtime.PYTHON_3_13],
    code: Code.fromAsset(layerPath),
  });

  return new Function(scope, 'BrainFunction', {
    runtime: Runtime.PYTHON_3_13,
    handler: 'handler.main',
    code: Code.fromAsset(path.join(__dirname, 'src'), {
      bundling: {
        local: {
          tryBundle: (outputDir: string) => {
            // If your dependencies are now in the layer, you might not need additional bundling.
            return true;
          },
        },
        image: Runtime.PYTHON_3_13.bundlingImage,
      },
    }),
    timeout: Duration.seconds(30),
    layers: [brainDepsLayer], // Attach the layer here!
  });
});

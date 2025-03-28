import { defineFunction } from '@aws-amplify/backend';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const brain = defineFunction((scope) => {
  return new Function(scope, 'BrainFunction', {
    runtime: Runtime.PYTHON_3_12,
    handler: 'handler.main',
    code: Code.fromAsset(path.join(__dirname, 'src'), {
    }),
    timeout: Duration.seconds(30),
    environment: {
      CONVERSATION_TABLE: 'Conversation-26hop7kmfng6hi2e2cm2hwkwna-NONE',
      MESSAGE_TABLE: 'Message-26hop7kmfng6hi2e2cm2hwkwna-NONE',
      RESPONSE_TABLE: 'BrainResponse-26hop7kmfng6hi2e2cm2hwkwna-NONE'
    },
  });
});


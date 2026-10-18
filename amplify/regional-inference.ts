import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export const INFERENCE_REGION = 'us-east-1';
export const DEFAULT_REGIONAL_MODEL = 'anthropic.claude-haiku-4-5';

export function regionalModelId(configured?: string): string {
  const model = configured?.trim() || DEFAULT_REGIONAL_MODEL;
  if (['us.anthropic.claude-haiku-4-5-20251001-v1:0', 'anthropic.claude-haiku-4-5-20251001-v1:0'].includes(model)) {
    return DEFAULT_REGIONAL_MODEL;
  }
  if (!/^anthropic\.[a-z0-9-]+$/.test(model)) {
    throw new Error('BEDROCK_MODEL_ID must be a regional Mantle Anthropic model ID, not an inference profile or ARN');
  }
  return model;
}

export function regionalInferencePolicy(account: string, model: string): PolicyStatement {
  return new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock-mantle:CreateInference'],
    resources: [`arn:aws:bedrock-mantle:${INFERENCE_REGION}:${account}:project/default`],
    conditions: {
      StringEquals: {
        'aws:RequestedRegion': INFERENCE_REGION,
        'bedrock-mantle:Model': regionalModelId(model),
      },
    },
  });
}

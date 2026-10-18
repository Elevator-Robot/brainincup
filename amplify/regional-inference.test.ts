import { describe, expect, it } from 'vitest';
import { DEFAULT_REGIONAL_MODEL, regionalInferencePolicy, regionalModelId } from './regional-inference';

describe('regional inference configuration', () => {
  it('migrates old Haiku settings to the user-selected GPT OSS model', () => {
    expect(regionalModelId()).toBe(DEFAULT_REGIONAL_MODEL);
    expect(regionalModelId('us.anthropic.claude-haiku-4-5-20251001-v1:0')).toBe(DEFAULT_REGIONAL_MODEL);
    expect(regionalModelId('anthropic.claude-haiku-4-5')).toBe('openai.gpt-oss-120b');
  });

  it('rejects cross-region profiles and ARNs', () => {
    for (const model of ['global.anthropic.claude-haiku-4-5-20251001-v1:0', 'us.anthropic.other', 'arn:aws:bedrock:us-east-2:123:inference-profile/other']) {
      expect(() => regionalModelId(model)).toThrow('regional Mantle');
    }
  });

  it('limits inference permissions to the regional project and selected model', () => {
    expect(regionalInferencePolicy('123456789012', DEFAULT_REGIONAL_MODEL).toStatementJson()).toEqual({
      Effect: 'Allow',
      Action: 'bedrock-mantle:CreateInference',
      Resource: 'arn:aws:bedrock-mantle:us-east-1:123456789012:project/default',
      Condition: { StringEquals: {
        'aws:RequestedRegion': 'us-east-1',
        'bedrock-mantle:Model': DEFAULT_REGIONAL_MODEL,
      } },
    });
  });
});

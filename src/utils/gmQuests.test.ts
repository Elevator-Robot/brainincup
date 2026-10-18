import { describe, expect, it } from 'vitest';
import { mapActiveQuests } from './gmQuests';

describe('persisted quest summaries', () => {
  it('omits finished or invalid records and uses real progress', () => {
    expect(mapActiveQuests([
      { id: 'q1', status: 'ACTIVE', questDefinitionId: 'missing_lantern', currentStepIndex: 1, totalSteps: 4 },
      { id: 'q2', status: 'COMPLETED' }, { id: 'q3', status: 'FAILED' }, { id: null, status: 'ACTIVE' },
    ])).toEqual([{ id: 'q1', title: 'Missing Lantern', stepProgress: '2 / 4' }]);
  });
  it('does not invent progress when total steps are unavailable', () => {
    expect(mapActiveQuests([{ id: 'q1', status: 'ACTIVE' }])[0].stepProgress).toBeUndefined();
  });
});

interface QuestRecord {
  id?: string | null;
  questDefinitionId?: string | null;
  status?: string | null;
  currentStepIndex?: number | null;
  totalSteps?: number | null;
}

/** Show persisted quest progress rather than placeholder adventure copy. */
export function mapActiveQuests(records: QuestRecord[]) {
  return records.filter((record): record is QuestRecord & { id: string } => Boolean(record.id) && record.status === 'ACTIVE').map(record => {
    const total = Math.max(0, record.totalSteps ?? 0);
    const step = Math.max(1, (record.currentStepIndex ?? 0) + 1);
    return {
      id: record.id,
      title: record.questDefinitionId?.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) || 'Quest',
      stepProgress: total ? `${Math.min(step, total)} / ${total}` : undefined,
    };
  });
}

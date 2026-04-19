interface Quest {
  id: string;
  title: string;
  currentStep?: string;
  stepProgress?: string;
  isNew?: boolean;
}

interface QuestLogPanelProps {
  quests?: Quest[];
}

const STATUS_BADGE_CLASSES = 'text-xs px-2 py-0.5 rounded-full font-medium';

function QuestLogPanel({ quests = [] }: QuestLogPanelProps) {
  if (quests.length === 0) {
    return (
      <div className="p-4 text-brand-text-secondary text-sm text-center">
        No active quests.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {quests.map((quest) => (
        <div
          key={quest.id}
          className={`rounded-lg p-3 border transition-colors duration-200 ${
            quest.isNew
              ? 'border-brand-accent-primary bg-brand-accent-primary/10'
              : 'border-brand-surface-border bg-brand-surface-dark'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-brand-text-primary text-sm font-medium leading-snug">
              {quest.title}
            </span>
            {quest.isNew && (
              <span className={`${STATUS_BADGE_CLASSES} bg-brand-accent-primary/20 text-brand-accent-primary shrink-0`}>
                New
              </span>
            )}
          </div>

          {quest.currentStep && (
            <p className="text-brand-text-secondary text-xs mt-1 leading-relaxed">
              {quest.currentStep}
            </p>
          )}

          {quest.stepProgress && (
            <div className="mt-2">
              <span className={`${STATUS_BADGE_CLASSES} bg-brand-surface-border text-brand-text-secondary`}>
                {quest.stepProgress}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default QuestLogPanel;

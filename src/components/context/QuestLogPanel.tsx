import type { Quest } from '../ContextWindowPanel';
import type { CollectionUpdates } from '../../hooks/useContextUpdates';

interface QuestLogPanelProps {
  quests?: Quest[];
  updates?: CollectionUpdates;
}

function QuestLogPanel({ quests = [], updates }: QuestLogPanelProps) {
  if (quests.length === 0) {
    return updates?.notice ? <p className="cosmic-context-notice">{updates.notice}</p> : null;
  }

  return (
    <div className="cosmic-quest-list">
      {updates?.notice && <p className="cosmic-context-notice">{updates.notice}</p>}
      {quests.map((quest) => (
        <div
          key={quest.id}
          className="cosmic-quest-card"
          data-update={updates?.items[quest.id]}
        >
          <div className="flex items-start justify-between gap-2">
            <h3>
              {quest.title}
            </h3>
            {(quest.isNew || updates?.items[quest.id]) && (
              <span className="cosmic-update-label">
                {updates?.items[quest.id] === 'updated' ? 'Updated' : 'New'}
              </span>
            )}
          </div>

          {quest.currentStep && (
            <p className="cosmic-quest-step">
              {quest.currentStep}
            </p>
          )}

          {quest.stepProgress && (
            <p className="cosmic-quest-progress"><span>Progress</span><strong>{quest.stepProgress}</strong></p>
          )}
        </div>
      ))}
    </div>
  );
}

export default QuestLogPanel;

// TODO (Task 10.7): Integrate ContextWindowPanel into App.tsx in place of the current context area.
// Pass playerState, activeQuests, diceRollLog, and gameEvents as props.

import { useContextPanel, type ContextPanel, type GameEvent } from '../hooks/useContextPanel';
import CharacterSheetPanel from './context/CharacterSheetPanel';
import QuestLogPanel from './context/QuestLogPanel';
import WorldMapPanel from './context/WorldMapPanel';
import TimelinePanel, { type TimelineEntry } from './context/TimelinePanel';

interface DiceRollEntry {
  statName: string;
  diceValue: number;
  statModifier: number;
  difficultyClass: number;
  outcome: 'CRITICAL_SUCCESS' | 'SUCCESS' | 'FAILURE' | 'CRITICAL_FAILURE';
  rollResult: number;
}

interface Quest {
  id: string;
  title: string;
  currentStep?: string;
  stepProgress?: string;
  isNew?: boolean;
}

interface ContextWindowPanelProps {
  playerState?: {
    currentLevel?: number;
    currentXP?: number;
    xpToNextLevel?: number;
    currentAreaId?: string;
    lastKnownLocation?: string;
    diceRollLog?: DiceRollEntry[];
    pendingDiceRoll?: unknown;
  };
  character?: {
    name?: string;
    level?: number;
    currentHP?: number;
    maxHP?: number;
    stats?: Record<string, number>;
    avatarSrc?: string;
  };
  currentLocation?: string;
  activeQuests?: Quest[];
  timelineEntries?: TimelineEntry[];
  gameEvents?: GameEvent[];
}

const TABS: { id: ContextPanel; label: string }[] = [
  { id: 'character', label: 'Character' },
  { id: 'dice', label: 'Timeline' },
];

function ContextWindowPanel({
  playerState,
  character,
  currentLocation,
  activeQuests = [],
  timelineEntries = [],
  gameEvents = [],
}: ContextWindowPanelProps) {
  const { activePanel, setActivePanel, levelUpAnimating } = useContextPanel(gameEvents);

  return (
    <div className="flex flex-col h-full">
      {/* Tab switcher */}
      <div className="flex border-b border-brand-surface-border shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors duration-200 ${
              activePanel === tab.id
                ? 'text-brand-accent-primary border-b-2 border-brand-accent-primary'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel content with opacity transition */}
      <div className="flex-1 overflow-y-auto transition-opacity duration-200">
        {activePanel === 'character' && (
          <CharacterSheetPanel
            name={character?.name}
            level={character?.level ?? playerState?.currentLevel}
            currentHP={character?.currentHP}
            maxHP={character?.maxHP}
            currentXP={playerState?.currentXP}
            xpToNextLevel={playerState?.xpToNextLevel}
            stats={character?.stats as CharacterSheetPanelProps['stats']}
            currentLocation={currentLocation ?? playerState?.lastKnownLocation}
            avatarSrc={character?.avatarSrc}
            levelUpAnimating={levelUpAnimating}
          />
        )}

        {activePanel === 'quests' && (
          <QuestLogPanel quests={activeQuests} />
        )}

        {activePanel === 'map' && (
          <WorldMapPanel
            currentLocation={playerState?.lastKnownLocation}
            characterLevel={character?.level ?? playerState?.currentLevel}
          />
        )}

        {activePanel === 'dice' && (
          <TimelinePanel
            entries={timelineEntries}
            currentLocation={currentLocation}
          />
        )}
      </div>
    </div>
  );
}

// Re-export types for consumers
export type { Quest, DiceRollEntry };
export default ContextWindowPanel;

// Internal type alias used above
type CharacterSheetPanelProps = Parameters<typeof CharacterSheetPanel>[0];

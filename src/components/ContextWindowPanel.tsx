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
    avatarSrcWebp?: string;
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
      <div className="flex-1 transition-opacity duration-200">
        {activePanel === 'character' && character && (
          <CharacterSheetPanel
            name={character.name}
            level={character.level ?? playerState?.currentLevel}
            currentHP={character.currentHP}
            maxHP={character.maxHP}
            currentXP={playerState?.currentXP}
            xpToNextLevel={playerState?.xpToNextLevel}
            stats={character.stats as CharacterSheetPanelProps['stats']}
            currentLocation={currentLocation ?? playerState?.lastKnownLocation}
            avatarSrc={character.avatarSrc}
            avatarSrcWebp={character.avatarSrcWebp}
            levelUpAnimating={levelUpAnimating}
          />
        )}

        {activePanel === 'character' && !character && (
          <div className="p-4 space-y-3">
            {/* Avatar + name skeleton */}
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-xl bg-brand-surface-hover" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-brand-surface-hover rounded w-2/3" />
                <div className="h-2 bg-brand-surface-hover rounded w-1/3" />
              </div>
            </div>
            {/* HP bar skeleton */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <div className="h-2 bg-brand-surface-hover rounded w-6" />
                <div className="h-2 bg-brand-surface-hover rounded w-10" />
              </div>
              <div className="h-1.5 bg-brand-surface-hover rounded-full w-full" />
            </div>
            {/* XP bar skeleton */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <div className="h-2 bg-brand-surface-hover rounded w-6" />
                <div className="h-2 bg-brand-surface-hover rounded w-10" />
              </div>
              <div className="h-1.5 bg-brand-surface-hover rounded-full w-full" />
            </div>
            {/* Stats grid skeleton */}
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-brand-surface-hover rounded-lg p-1.5 space-y-1">
                  <div className="h-1.5 bg-brand-surface-dark/50 rounded w-6 mx-auto" />
                  <div className="h-3 bg-brand-surface-dark/50 rounded w-4 mx-auto" />
                  <div className="h-1.5 bg-brand-surface-dark/50 rounded w-3 mx-auto" />
                </div>
              ))}
            </div>
          </div>
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

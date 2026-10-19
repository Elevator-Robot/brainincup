// TODO (Task 10.7): Integrate ContextWindowPanel into App.tsx in place of the current context area.
// Pass playerState, activeQuests, diceRollLog, and gameEvents as props.

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
  /** Notified when the context tab changes (character / timeline / …). */
  onActivePanelChange?: (panel: ContextPanel) => void;
  /**
   * Extra content under the Character tab only (inventory, dice, etc.).
   * Scrolls with the panel body while Character/Timeline tabs stay pinned.
   */
  children?: ReactNode;
}

const TABS: { id: ContextPanel; label: string }[] = [
  { id: 'character', label: 'Character' },
  { id: 'quests', label: 'Quests' },
  { id: 'map', label: 'Location' },
  { id: 'dice', label: 'Timeline' },
];

function ContextWindowPanel({
  playerState,
  character,
  currentLocation,
  activeQuests = [],
  timelineEntries = [],
  gameEvents = [],
  onActivePanelChange,
  children,
}: ContextWindowPanelProps) {
  const { activePanel, setActivePanel, levelUpAnimating } = useContextPanel(gameEvents);
  const panelId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState(1);
  const selectPanel = (panel: ContextPanel) => {
    setDirection(TABS.findIndex(tab => tab.id === panel) >= TABS.findIndex(tab => tab.id === activePanel) ? 1 : -1);
    setActivePanel(panel);
  };
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [activePanel]);

  useEffect(() => {
    onActivePanelChange?.(activePanel);
  }, [activePanel, onActivePanelChange]);

  return (
    <div className="cosmic-context-panel flex min-h-0 flex-1 flex-col">
      {/* Pinned tab switcher — stays fixed while the panel body scrolls */}
      <div className="retro-context-tabs shrink-0 z-20" role="tablist" aria-label="Context panels">
        {TABS.map((tab, index) => {
          const isActive = activePanel === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${panelId}-${tab.id}-tab`}
              aria-controls={`${panelId}-panel`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectPanel(tab.id)}
              onKeyDown={event => {
                const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length
                  : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null;
                if (next === null) return;
                event.preventDefault();
                selectPanel(TABS[next].id);
                document.getElementById(`${panelId}-${TABS[next].id}-tab`)?.focus();
              }}
              className={`retro-context-tab ${isActive ? 'retro-context-tab--active' : ''}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Scrollable body: active panel + optional Character-only chrome */}
      <div ref={bodyRef} id={`${panelId}-panel`} role="tabpanel" aria-labelledby={`${panelId}-${activePanel}-tab`} tabIndex={0}
        className="retro-context-body min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div key={activePanel} className="gm-context-reveal" style={{ '--gm-panel-shift': `${direction * 8}px` } as CSSProperties}>
          {activePanel === 'character' && character && (
            <CharacterSheetPanel
              name={character.name}
              level={character.level ?? playerState?.currentLevel}
              currentHP={character.currentHP}
              maxHP={character.maxHP}
              currentXP={playerState?.currentXP}
              xpToNextLevel={playerState?.xpToNextLevel}
              stats={character.stats as CharacterSheetPanelProps['stats']}
              avatarSrc={character.avatarSrc}
              avatarSrcWebp={character.avatarSrcWebp}
              levelUpAnimating={levelUpAnimating}
            />
          )}


          {activePanel === 'quests' && (
            <QuestLogPanel quests={activeQuests} />
          )}

          {activePanel === 'map' && (
            <WorldMapPanel
              currentLocation={currentLocation || playerState?.lastKnownLocation}
              characterLevel={character?.level ?? playerState?.currentLevel}
            />
          )}

          {activePanel === 'dice' && (
            <TimelinePanel
              entries={timelineEntries}
              currentLocation={currentLocation}
            />
          )}
          {activePanel === 'character' && children ? (
            <div className="mt-4 flex flex-col gap-4 pb-1">
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Re-export types for consumers
export type { Quest, DiceRollEntry };
export default ContextWindowPanel;

// Internal type alias used above
type CharacterSheetPanelProps = Parameters<typeof CharacterSheetPanel>[0];

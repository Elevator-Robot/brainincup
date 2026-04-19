import { useState, useEffect, useCallback } from 'react';

export type ContextPanel = 'character' | 'quests' | 'map' | 'dice';

export interface GameEvent {
  type: 'DICE_ROLL_REQUESTED' | 'LEVEL_UP' | 'QUEST_ASSIGNED' | string;
  payload?: unknown;
}

export function useContextPanel(gameEvents: GameEvent[]) {
  const [activePanel, setActivePanelState] = useState<ContextPanel>('character');
  const [levelUpAnimating, setLevelUpAnimating] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    if (gameEvents.length === 0) return;
    const latest = gameEvents[gameEvents.length - 1];
    if (!latest) return;

    if (latest.type === 'DICE_ROLL_REQUESTED') {
      setActivePanelState('dice');
      setManualOverride(false);
    } else if (latest.type === 'LEVEL_UP') {
      setActivePanelState('character');
      setLevelUpAnimating(true);
      setManualOverride(false);
      setTimeout(() => setLevelUpAnimating(false), 1500);
    } else if (latest.type === 'QUEST_ASSIGNED') {
      setActivePanelState('quests');
      setManualOverride(false);
    }
  }, [gameEvents]);

  const setActivePanel = useCallback((panel: ContextPanel) => {
    setActivePanelState(panel);
    setManualOverride(true);
  }, []);

  return { activePanel, setActivePanel, levelUpAnimating, manualOverride };
}

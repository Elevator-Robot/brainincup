/**
 * Vitest integration tests for ContextWindowPanel component.
 *
 * Verifies:
 * 1. Panel auto-switches to Character Sheet on LEVEL_UP event
 * 2. Panel auto-switches to Dice History on DICE_ROLL_REQUESTED event
 * 3. Panel auto-switches to Quest Log on QUEST_ASSIGNED event
 * 4. Manual tab click overrides auto-switch
 * 5. Panels do not flicker during streaming (activePanel stable when no new events)
 *
 * **Validates: Requirements 12.2, 12.3, 12.4, 12.5, 12.6**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ContextWindowPanel from './ContextWindowPanel';
import type { GameEvent } from '../hooks/useContextPanel';

// Mock sub-panels to keep tests focused on switching logic
vi.mock('./context/CharacterSheetPanel', () => ({
  default: () => <div data-testid="character-sheet-panel">CharacterSheet</div>,
}));
vi.mock('./context/QuestLogPanel', () => ({
  default: () => <div data-testid="quest-log-panel">QuestLog</div>,
}));
vi.mock('./context/WorldMapPanel', () => ({
  default: () => <div data-testid="world-map-panel">WorldMap</div>,
}));
vi.mock('./context/DiceHistoryPanel', () => ({
  default: () => <div data-testid="dice-history-panel">DiceHistory</div>,
}));

describe('ContextWindowPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Requirement 12.3 — auto-switch to Character Sheet on LEVEL_UP
  it('auto-switches to Character Sheet panel on LEVEL_UP event', () => {
    const events: GameEvent[] = [{ type: 'LEVEL_UP' }];
    render(<ContextWindowPanel gameEvents={events} />);

    expect(screen.getByTestId('character-sheet-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('dice-history-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quest-log-panel')).not.toBeInTheDocument();
  });

  // Requirement 12.2 — auto-switch to Dice History on DICE_ROLL_REQUESTED
  it('auto-switches to Dice History panel on DICE_ROLL_REQUESTED event', () => {
    const events: GameEvent[] = [{ type: 'DICE_ROLL_REQUESTED' }];
    render(<ContextWindowPanel gameEvents={events} />);

    expect(screen.getByTestId('dice-history-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('character-sheet-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quest-log-panel')).not.toBeInTheDocument();
  });

  // Requirement 12.4 — auto-switch to Quest Log on QUEST_ASSIGNED
  it('auto-switches to Quest Log panel on QUEST_ASSIGNED event', () => {
    const events: GameEvent[] = [{ type: 'QUEST_ASSIGNED' }];
    render(<ContextWindowPanel gameEvents={events} />);

    expect(screen.getByTestId('quest-log-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('character-sheet-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dice-history-panel')).not.toBeInTheDocument();
  });

  // Requirement 12.5 — manual tab click overrides auto-switch
  it('manual tab click overrides auto-switch', () => {
    // Start with a DICE_ROLL_REQUESTED event (dice panel active)
    const events: GameEvent[] = [{ type: 'DICE_ROLL_REQUESTED' }];
    render(<ContextWindowPanel gameEvents={events} />);

    expect(screen.getByTestId('dice-history-panel')).toBeInTheDocument();

    // User manually clicks the Quests tab
    fireEvent.click(screen.getByRole('button', { name: /quests/i }));

    expect(screen.getByTestId('quest-log-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('dice-history-panel')).not.toBeInTheDocument();
  });

  it('manual tab click to Map panel shows world map', () => {
    render(<ContextWindowPanel gameEvents={[]} />);

    fireEvent.click(screen.getByRole('button', { name: /map/i }));

    expect(screen.getByTestId('world-map-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('character-sheet-panel')).not.toBeInTheDocument();
  });

  it('manual tab click to Character tab shows character sheet', () => {
    const events: GameEvent[] = [{ type: 'DICE_ROLL_REQUESTED' }];
    render(<ContextWindowPanel gameEvents={events} />);

    // Dice panel is active; user clicks Character tab
    fireEvent.click(screen.getByRole('button', { name: /character/i }));

    expect(screen.getByTestId('character-sheet-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('dice-history-panel')).not.toBeInTheDocument();
  });

  // Requirement 12.6 — panels do not flicker during streaming
  it('does not flicker when re-rendered with same events (streaming scenario)', () => {
    const events: GameEvent[] = [{ type: 'QUEST_ASSIGNED' }];
    const { rerender } = render(<ContextWindowPanel gameEvents={events} />);

    expect(screen.getByTestId('quest-log-panel')).toBeInTheDocument();

    // Simulate multiple re-renders during streaming (same events, no new auto-switch)
    rerender(<ContextWindowPanel gameEvents={events} />);
    expect(screen.getByTestId('quest-log-panel')).toBeInTheDocument();

    rerender(<ContextWindowPanel gameEvents={events} />);
    expect(screen.getByTestId('quest-log-panel')).toBeInTheDocument();
  });

  it('renders all four tab buttons', () => {
    render(<ContextWindowPanel gameEvents={[]} />);

    expect(screen.getByRole('button', { name: /character/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quests/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /map/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dice/i })).toBeInTheDocument();
  });

  it('defaults to Character Sheet panel when no events provided', () => {
    render(<ContextWindowPanel gameEvents={[]} />);
    expect(screen.getByTestId('character-sheet-panel')).toBeInTheDocument();
  });
});

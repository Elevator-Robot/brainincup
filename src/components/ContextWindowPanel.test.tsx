/**
 * Vitest integration tests for ContextWindowPanel component.
 *
 * Verifies:
 * 1. Panel auto-switches to Character Sheet on LEVEL_UP event
 * 2. DICE_ROLL_REQUESTED does not steal focus from Character (Timeline is narrative-only)
 * 3. Panel auto-switches to Quest Log on QUEST_ASSIGNED event
 * 4. Manual tab click between Character and Timeline
 * 5. Panels do not flicker during streaming (activePanel stable when no new events)
 * 6. Character-only children (inventory/dice) stay off the Timeline tab
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
vi.mock('./context/TimelinePanel', () => ({
  default: () => <div data-testid="timeline-panel">Timeline</div>,
}));

const sampleCharacter = {
  name: 'Test Hero',
  level: 1,
  currentHP: 10,
  maxHP: 10,
};

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
    render(<ContextWindowPanel character={sampleCharacter} gameEvents={events} />);

    expect(screen.getByTestId('character-sheet-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quest-log-panel')).not.toBeInTheDocument();
  });

  // Dice stays under Character — Timeline is narrative-only.
  it('stays on Character Sheet on DICE_ROLL_REQUESTED event', () => {
    const events: GameEvent[] = [{ type: 'DICE_ROLL_REQUESTED' }];
    render(<ContextWindowPanel character={sampleCharacter} gameEvents={events} />);

    expect(screen.getByTestId('character-sheet-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-panel')).not.toBeInTheDocument();
  });

  // Requirement 12.4 — auto-switch to Quest Log on QUEST_ASSIGNED
  it('auto-switches to Quest Log panel on QUEST_ASSIGNED event', () => {
    const events: GameEvent[] = [{ type: 'QUEST_ASSIGNED' }];
    render(<ContextWindowPanel character={sampleCharacter} gameEvents={events} />);

    expect(screen.getByTestId('quest-log-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('character-sheet-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-panel')).not.toBeInTheDocument();
  });

  it('manual tab click to Timeline shows timeline panel', () => {
    render(<ContextWindowPanel character={sampleCharacter} gameEvents={[]} />);

    fireEvent.click(screen.getByRole('tab', { name: /timeline/i }));

    expect(screen.getByTestId('timeline-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('character-sheet-panel')).not.toBeInTheDocument();
  });

  it('manual tab click to Character tab shows character sheet', () => {
    render(<ContextWindowPanel character={sampleCharacter} gameEvents={[]} />);

    fireEvent.click(screen.getByRole('tab', { name: /timeline/i }));
    expect(screen.getByTestId('timeline-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /character/i }));

    expect(screen.getByTestId('character-sheet-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-panel')).not.toBeInTheDocument();
  });

  it('renders Character-only children under Character and hides them on Timeline', () => {
    render(
      <ContextWindowPanel character={sampleCharacter} gameEvents={[]}>
        <div data-testid="character-only-chrome">Inventory + Dice</div>
      </ContextWindowPanel>
    );

    expect(screen.getByTestId('character-only-chrome')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /timeline/i }));
    expect(screen.queryByTestId('character-only-chrome')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /character/i }));
    expect(screen.getByTestId('character-only-chrome')).toBeInTheDocument();
  });

  // Requirement 12.6 — panels do not flicker during streaming
  it('does not flicker when re-rendered with same events (streaming scenario)', () => {
    const events: GameEvent[] = [{ type: 'QUEST_ASSIGNED' }];
    const { rerender } = render(
      <ContextWindowPanel character={sampleCharacter} gameEvents={events} />
    );

    expect(screen.getByTestId('quest-log-panel')).toBeInTheDocument();

    rerender(<ContextWindowPanel character={sampleCharacter} gameEvents={events} />);
    expect(screen.getByTestId('quest-log-panel')).toBeInTheDocument();

    rerender(<ContextWindowPanel character={sampleCharacter} gameEvents={events} />);
    expect(screen.getByTestId('quest-log-panel')).toBeInTheDocument();
  });

  it('renders Character and Timeline tab buttons', () => {
    render(<ContextWindowPanel character={sampleCharacter} gameEvents={[]} />);

    expect(screen.getByRole('tab', { name: /character/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /timeline/i })).toBeInTheDocument();
  });

  it('defaults to Character Sheet panel when no events provided', () => {
    render(<ContextWindowPanel character={sampleCharacter} gameEvents={[]} />);
    expect(screen.getByTestId('character-sheet-panel')).toBeInTheDocument();
  });
});

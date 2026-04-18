/**
 * Vitest unit tests for useContextPanel hook.
 *
 * Verifies:
 * 1. Panel auto-switches to 'character' on LEVEL_UP event
 * 2. Panel auto-switches to 'dice' on DICE_ROLL_REQUESTED event
 * 3. Panel auto-switches to 'quests' on QUEST_ASSIGNED event
 * 4. Manual tab click overrides auto-switch
 * 5. Panels do not flicker during streaming
 *
 * **Validates: Requirements 12.2, 12.3, 12.4, 12.5, 12.6**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContextPanel, type GameEvent } from './useContextPanel';

describe('useContextPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with character panel active by default', () => {
    const { result } = renderHook(() => useContextPanel([]));
    expect(result.current.activePanel).toBe('character');
  });

  // Requirement 12.3 — auto-switch to character on LEVEL_UP
  it('auto-switches to character panel on LEVEL_UP event', () => {
    const events: GameEvent[] = [{ type: 'LEVEL_UP' }];
    const { result } = renderHook(() => useContextPanel(events));
    expect(result.current.activePanel).toBe('character');
  });

  it('sets levelUpAnimating to true on LEVEL_UP event', () => {
    const events: GameEvent[] = [{ type: 'LEVEL_UP' }];
    const { result } = renderHook(() => useContextPanel(events));
    expect(result.current.levelUpAnimating).toBe(true);
  });

  it('clears levelUpAnimating after 1500ms', () => {
    const events: GameEvent[] = [{ type: 'LEVEL_UP' }];
    const { result } = renderHook(() => useContextPanel(events));
    expect(result.current.levelUpAnimating).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.levelUpAnimating).toBe(false);
  });

  // Requirement 12.2 — auto-switch to dice on DICE_ROLL_REQUESTED
  it('auto-switches to dice panel on DICE_ROLL_REQUESTED event', () => {
    const events: GameEvent[] = [{ type: 'DICE_ROLL_REQUESTED' }];
    const { result } = renderHook(() => useContextPanel(events));
    expect(result.current.activePanel).toBe('dice');
  });

  // Requirement 12.4 — auto-switch to quests on QUEST_ASSIGNED
  it('auto-switches to quests panel on QUEST_ASSIGNED event', () => {
    const events: GameEvent[] = [{ type: 'QUEST_ASSIGNED' }];
    const { result } = renderHook(() => useContextPanel(events));
    expect(result.current.activePanel).toBe('quests');
  });

  // Requirement 12.5 — manual tab click overrides auto-switch
  it('manual setActivePanel overrides auto-switch and sets manualOverride', () => {
    const { result } = renderHook(() => useContextPanel([]));

    act(() => {
      result.current.setActivePanel('map');
    });

    expect(result.current.activePanel).toBe('map');
    expect(result.current.manualOverride).toBe(true);
  });

  it('manual override is cleared when a new game event arrives', () => {
    const { result, rerender } = renderHook(
      ({ events }: { events: GameEvent[] }) => useContextPanel(events),
      { initialProps: { events: [] as GameEvent[] } }
    );

    act(() => {
      result.current.setActivePanel('map');
    });
    expect(result.current.manualOverride).toBe(true);

    rerender({ events: [{ type: 'DICE_ROLL_REQUESTED' }] });
    expect(result.current.activePanel).toBe('dice');
    expect(result.current.manualOverride).toBe(false);
  });

  // Requirement 12.6 — panels do not flicker during streaming
  // When no new auto-switch events arrive (events array unchanged), activePanel stays stable
  it('does not change activePanel when events array is stable (no flicker during streaming)', () => {
    const events: GameEvent[] = [{ type: 'QUEST_ASSIGNED' }];
    const { result, rerender } = renderHook(
      ({ events }: { events: GameEvent[] }) => useContextPanel(events),
      { initialProps: { events } }
    );

    expect(result.current.activePanel).toBe('quests');

    // Re-render with same events reference (simulates streaming re-renders)
    rerender({ events });
    expect(result.current.activePanel).toBe('quests');

    rerender({ events });
    expect(result.current.activePanel).toBe('quests');
  });

  it('does not switch panel for unknown event types', () => {
    const { result, rerender } = renderHook(
      ({ events }: { events: GameEvent[] }) => useContextPanel(events),
      { initialProps: { events: [] as GameEvent[] } }
    );

    rerender({ events: [{ type: 'UNKNOWN_EVENT' }] });
    expect(result.current.activePanel).toBe('character');
  });

  it('last event wins when multiple events arrive simultaneously', () => {
    const { result, rerender } = renderHook(
      ({ events }: { events: GameEvent[] }) => useContextPanel(events),
      { initialProps: { events: [] as GameEvent[] } }
    );

    rerender({
      events: [
        { type: 'DICE_ROLL_REQUESTED' },
        { type: 'LEVEL_UP' },
        { type: 'QUEST_ASSIGNED' },
      ],
    });

    expect(result.current.activePanel).toBe('quests');
  });
});

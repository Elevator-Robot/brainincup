import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useContextUpdates } from './useContextUpdates';
import type { InventoryItem } from '../components/InventoryManager';
import type { Quest } from '../components/ContextWindowPanel';
import { parseInventoryItems } from '../utils/inventory';

const potion: InventoryItem = { id: 'potion', name: 'Healing Potion', type: 'consumable', quantity: 1 };
const quest: Quest = { id: 'quest', title: 'The Missing Constellation', stepProgress: '1 / 4' };
type Input = { conversation: string; inventory?: InventoryItem[]; quests?: Quest[] };
const useUpdates = ({ conversation, inventory, quests }: Input) => useContextUpdates(conversation, inventory, quests);
afterEach(() => { vi.useRealTimers(); });

it('silently baselines delayed hydration and ignores equivalent/reordered snapshots', () => {
  const { result, rerender } = renderHook(useUpdates, { initialProps: { conversation: 'one' } as Input });
  rerender({ conversation: 'one', inventory: [potion], quests: [quest] });
  expect(result.current.inventory.notice).toBe('');
  expect(result.current.quests.notice).toBe('');
  rerender({ conversation: 'one', inventory: [{ ...potion, equipped: false, description: '' }], quests: [{ ...quest, isNew: true }] });
  expect(result.current.inventory.notice).toBe('');
  expect(result.current.quests.notice).toBe('');
});

it('does not flag legacy inventory refreshes/reordering as additions but still tracks quantity changes', () => {
  const entries = ['Rope', { name: 'Potion', quantity: 2 }];
  const { result, rerender } = renderHook(useUpdates, {
    initialProps: { conversation: 'one', inventory: parseInventoryItems(JSON.stringify(entries)) } as Input,
  });
  rerender({ conversation: 'one', inventory: parseInventoryItems([...entries].reverse()) });
  expect(result.current.inventory.notice).toBe('');
  rerender({ conversation: 'one', inventory: parseInventoryItems(['Rope', { name: 'Potion', quantity: 3 }]) });
  expect(result.current.inventory.notice).toBe('Updated Potion');
});

it('reports actual item/progress changes, retains them across panel-independent renders, and expires them', () => {
  vi.useFakeTimers();
  const { result, rerender, unmount } = renderHook(useUpdates, {
    initialProps: { conversation: 'one', inventory: [potion], quests: [quest] },
  });
  const next = { conversation: 'one', inventory: [{ ...potion, quantity: 2 }], quests: [{ ...quest, stepProgress: '2 / 4' }] };
  rerender(next);
  expect(result.current.inventory.items).toEqual({ potion: 'updated' });
  expect(result.current.inventory.notice).toBe('Updated Healing Potion');
  expect(result.current.quests.items).toEqual({ quest: 'updated' });
  rerender({ ...next, inventory: [...next.inventory], quests: [...next.quests] });
  act(() => vi.advanceTimersByTime(7999));
  expect(result.current.quests.notice).toBe('Updated The Missing Constellation');
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.inventory.notice).toBe('');
  expect(result.current.quests.items).toEqual({});
  rerender({ ...next, inventory: [{ ...potion, quantity: 3 }] });
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('distinguishes additions/removals without inventing quest completion and resets on navigation', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(useUpdates, {
    initialProps: { conversation: 'one', inventory: [] as InventoryItem[], quests: [quest] },
  });
  rerender({ conversation: 'one', inventory: [potion], quests: [] });
  expect(result.current.inventory.items.potion).toBe('added');
  expect(result.current.quests.notice).toBe('The Missing Constellation left the active quest log');
  rerender({ conversation: 'two', inventory: [{ ...potion, quantity: 8 }], quests: [] });
  expect(result.current.inventory.notice).toBe('');
  expect(result.current.quests.notice).toBe('');
  expect(vi.getTimerCount()).toBe(0);
  rerender({ conversation: 'two', inventory: [], quests: [] });
  expect(result.current.inventory.notice).toBe('Removed Healing Potion');
});

import { expect, it } from 'vitest';
import { parseInventoryItems } from './inventory';

it('preserves stored item IDs and distinguishes repeated legacy entries', () => {
  const inventory = [{ id: 'saved', name: 'Potion', type: 'quest', quantity: 3 }, 'Rope', 'Rope', { name: 'Rope', type: 'weapon' }];
  const parsed = parseInventoryItems(JSON.stringify(inventory));
  expect(parsed[0]).toEqual(inventory[0]);
  expect(new Set(parsed.map(item => item.id)).size).toBe(4);
  expect(parseInventoryItems(inventory)).toEqual(parsed);
});

it('retains tolerant normalization of missing or invalid entries', () => {
  expect(parseInventoryItems(null)).toEqual([]);
  expect(parseInventoryItems({ items: [] })).toEqual([]);
  expect(parseInventoryItems([null, false, { name: 4 }, { name: 'Potion', type: 'unknown', quantity: 0 }]))
    .toEqual([expect.objectContaining({ name: 'Potion', type: 'consumable', quantity: 1 })]);
});

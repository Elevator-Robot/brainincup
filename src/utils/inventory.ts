import type { InventoryItem } from '../components/InventoryManager';

const inventoryTypes = new Set<InventoryItem['type']>(['weapon', 'armor', 'consumable', 'quest', 'currency']);

/** Preserve stored IDs; give legacy entries stable display keys across refreshes. */
export function parseInventoryItems(rawInventory: unknown): InventoryItem[] {
  if (!rawInventory) return [];
  let parsedValue: unknown = rawInventory;
  if (typeof rawInventory === 'string') {
    try {
      parsedValue = JSON.parse(rawInventory);
    } catch (error) {
      console.error('Failed to parse inventory:', error);
      return [];
    }
  }
  if (!Array.isArray(parsedValue)) return [];
  const occurrences = new Map<string, number>();
  const legacyId = (name: string, type: InventoryItem['type']) => {
    const key = JSON.stringify([name, type]);
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    return `legacy:${key}:${occurrence}`;
  };

  return parsedValue.flatMap((item): InventoryItem[] => {
    if (typeof item === 'string') {
      return [{ id: legacyId(item, 'consumable'), name: item, type: 'consumable', quantity: 1 }];
    }
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<InventoryItem>;
    if (!candidate.name || typeof candidate.name !== 'string') return [];
    const type = inventoryTypes.has(candidate.type as InventoryItem['type'])
      ? candidate.type as InventoryItem['type'] : 'consumable';
    return [{
      ...candidate,
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : legacyId(candidate.name, type),
      name: candidate.name,
      type,
      quantity: typeof candidate.quantity === 'number' && candidate.quantity > 0 ? candidate.quantity : 1,
    }];
  });
}

import { useEffect, useRef, useState } from 'react';
import type { InventoryItem } from '../components/InventoryManager';
import type { Quest } from '../components/ContextWindowPanel';

export interface CollectionUpdates {
  items: Record<string, 'added' | 'updated'>;
  notice: string;
}
export interface ContextUpdates {
  inventory: CollectionUpdates;
  quests: CollectionUpdates;
}
const EMPTY_COLLECTION: CollectionUpdates = { items: {}, notice: '' };
const EMPTY: ContextUpdates = { inventory: EMPTY_COLLECTION, quests: EMPTY_COLLECTION };
type Snapshot = Map<string, { value: string; name: string }>;

function difference(previous: Snapshot | undefined, current: Snapshot, label: string): CollectionUpdates | undefined {
  if (!previous) return;
  const items: CollectionUpdates['items'] = {};
  const descriptions: string[] = [];
  for (const [id, record] of current) {
    if (!previous.has(id)) {
      items[id] = 'added';
      descriptions.push(label === 'Inventory' ? `Added ${record.name}` : `New quest: ${record.name}`);
    } else if (previous.get(id)?.value !== record.value) {
      items[id] = 'updated';
      descriptions.push(`Updated ${record.name}`);
    }
  }
  for (const [id, record] of previous) {
    if (!current.has(id)) descriptions.push(label === 'Inventory' ? `Removed ${record.name}` : `${record.name} left the active quest log`);
  }
  if (!descriptions.length) return;
  return { items, notice: descriptions.length === 1 ? descriptions[0] : `${label}: ${descriptions.length} updates` };
}

/** Ephemeral UI feedback from received state, never a persisted gameplay event.
 * Each collection's first loaded snapshot and each conversation form a baseline. */
export function useContextUpdates(conversationId: string | null, inventory?: InventoryItem[], quests?: Quest[]) {
  const previous = useRef<{ conversationId: string | null; inventory?: Snapshot; quests?: Snapshot }>({ conversationId });
  const [updates, setUpdates] = useState<ContextUpdates & { conversationId: string | null }>({ ...EMPTY, conversationId });
  useEffect(() => {
    if (previous.current.conversationId !== conversationId) {
      previous.current = { conversationId };
      setUpdates({ ...EMPTY, conversationId });
    }
    const inventorySnapshot = inventory && new Map(inventory.map(item => [item.id, {
      name: item.name,
      value: JSON.stringify([item.name, item.type, item.quantity ?? 1, item.equipped ?? false,
        item.description ?? '', Object.entries(item.stats ?? {}).sort(([a], [b]) => a.localeCompare(b))]),
    }]));
    const questSnapshot = quests && new Map(quests.map(quest => [quest.id, {
      name: quest.title, value: JSON.stringify([quest.title, quest.currentStep ?? '', quest.stepProgress ?? '']),
    }]));
    const inventoryChange = inventorySnapshot && difference(previous.current.inventory, inventorySnapshot, 'Inventory');
    const questChange = questSnapshot && difference(previous.current.quests, questSnapshot, 'Quest log');
    if (inventorySnapshot) previous.current.inventory = inventorySnapshot;
    if (questSnapshot) previous.current.quests = questSnapshot;
    if (inventoryChange || questChange) {
      setUpdates(current => ({
        conversationId,
        inventory: inventoryChange
          ? { ...inventoryChange, items: { ...current.inventory.items, ...inventoryChange.items } } : current.inventory,
        quests: questChange ? { ...questChange, items: { ...current.quests.items, ...questChange.items } } : current.quests,
      }));
    }
  }, [conversationId, inventory, quests]);
  useEffect(() => {
    if (!updates.inventory.notice && !updates.quests.notice) return;
    const timeout = window.setTimeout(() => setUpdates({ ...EMPTY, conversationId }), 8000);
    return () => window.clearTimeout(timeout);
  }, [conversationId, updates]);
  return updates.conversationId === conversationId ? updates : EMPTY;
}

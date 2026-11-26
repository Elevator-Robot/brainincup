import { useState } from 'react';
import type { CollectionUpdates } from '../hooks/useContextUpdates';

export interface InventoryItem {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'consumable' | 'quest' | 'currency';
  quantity?: number;
  equipped?: boolean;
  description?: string;
  stats?: Record<string, number>;
}

interface InventoryManagerProps {
  inventory: InventoryItem[];
  onUpdateInventory: (newInventory: InventoryItem[]) => Promise<void>;
  isUpdating?: boolean;
  showTitle?: boolean;
  allowManualAdd?: boolean;
  maxSlots?: number;
  updates?: CollectionUpdates;
}

export default function InventoryManager({
  inventory,
  onUpdateInventory,
  isUpdating = false,
  showTitle = true,
  allowManualAdd = false,
  maxSlots = 20,
  updates,
}: InventoryManagerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: '',
    type: 'consumable',
    quantity: 1,
    description: '',
  });
  const [error, setError] = useState('');

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!allowManualAdd) {
      setShowAddModal(false);
      return;
    }
    
    if (!newItem.name?.trim()) {
      setError('Item name is required');
      return;
    }
    
    if (newItem.quantity && newItem.quantity < 1) {
      setError('Quantity must be at least 1');
      return;
    }

    const item: InventoryItem = {
      id: crypto.randomUUID(),
      name: newItem.name.trim(),
      type: newItem.type || 'consumable',
      quantity: newItem.quantity || 1,
      description: newItem.description?.trim() || '',
    };

    try {
      await onUpdateInventory([...inventory, item]);
      setShowAddModal(false);
      setNewItem({ name: '', type: 'consumable', quantity: 1, description: '' });
      setError('');
    } catch (err) {
      setError('Failed to add item. Please try again.');
      console.error('Error adding item:', err);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await onUpdateInventory(inventory.filter(item => item.id !== itemId));
    } catch (err) {
      console.error('Error removing item:', err);
    }
  };

  const totalSlots = Math.max(maxSlots, inventory.length);
  const usedSlots = Math.min(inventory.length, totalSlots);
  const collapsedVisibleItems = 6;
  const visibleItems = isExpanded ? inventory : inventory.slice(0, collapsedVisibleItems);
  const hiddenItemCount = Math.max(inventory.length - visibleItems.length, 0);
  const hasOverflow = inventory.length > collapsedVisibleItems;

  return (
    <div className="cosmic-inventory space-y-2">
      <div className="flex items-center justify-between gap-2 flex-nowrap">
        {showTitle ? <p className="cosmic-context-label">Inventory</p> : <span />}
        <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <span className="cosmic-inventory-capacity" aria-label={`${usedSlots} of ${totalSlots} inventory slots used`}>
            {usedSlots}/{totalSlots}
          </span>
          <button
            type="button"
            onClick={() => hasOverflow && setIsExpanded((prev) => !prev)}
            disabled={!hasOverflow}
            className="cosmic-inventory-toggle"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse inventory list' : 'Expand inventory list'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {allowManualAdd ? (
            <button
              onClick={() => setShowAddModal(true)}
              disabled={isUpdating}
              className="px-3 py-1 text-xs bg-brand-accent-primary hover:bg-brand-accent-secondary text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Item
            </button>
          ) : null}
        </div>
      </div>
      {updates?.notice && <p className="cosmic-context-notice">{updates.notice}</p>}

      <div className="space-y-1.5">
        {visibleItems.length === 0 ? (
          <p className="text-sm text-brand-text-muted italic">No items in inventory</p>
        ) : (
          visibleItems.map((item) => (
            <div
              key={item.id}
              className="cosmic-inventory-item"
              data-update={updates?.items[item.id]}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="cosmic-inventory-name">
                    {item.name}
                  </h4>
                  {item.quantity && item.quantity > 1 && (
                    <span className="cosmic-inventory-quantity">×{item.quantity}</span>
                  )}
                </div>
                <div className="cosmic-inventory-meta">
                  <span>{item.type}</span>
                  {item.equipped && <span className="cosmic-equipped">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Equipped
                  </span>}
                  {updates?.items[item.id] && <span className="cosmic-update-label">{updates.items[item.id] === 'added' ? 'Added' : 'Updated'}</span>}
                </div>
              </div>
              {allowManualAdd ? (
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  disabled={isUpdating}
                  className="text-red-500 hover:text-red-400 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Remove item"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {!isExpanded && hiddenItemCount > 0 ? (
        <p className="cosmic-inventory-overflow">Expand to view {hiddenItemCount} more items.</p>
      ) : null}

      {/* Add Item Modal */}
      {allowManualAdd && showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-brand-surface-elevated border border-brand-surface-border rounded-2xl shadow-2xl max-w-md w-full p-6 animate-slide-up">
            <h3 className="text-xl font-bold text-brand-text-primary mb-4">Add Item</h3>
            
            <form onSubmit={handleAddItem} className="space-y-4">
              {/* Item Name */}
              <div>
                <label htmlFor="itemName" className="block text-sm font-medium text-brand-text-primary mb-2">
                  Item Name *
                </label>
                <input
                  id="itemName"
                  type="text"
                  value={newItem.name || ''}
                  onChange={(e) => {
                    setNewItem({ ...newItem, name: e.target.value });
                    setError('');
                  }}
                  maxLength={50}
                  placeholder="Enter item name"
                  className="w-full px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-primary placeholder:text-brand-text-muted focus:outline-none focus:ring-2 focus:ring-brand-accent-primary focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Item Type */}
              <div>
                <label htmlFor="itemType" className="block text-sm font-medium text-brand-text-primary mb-2">
                  Type
                </label>
                <select
                  id="itemType"
                  value={newItem.type || 'consumable'}
                  onChange={(e) => setNewItem({ ...newItem, type: e.target.value as InventoryItem['type'] })}
                  className="w-full px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent-primary focus:border-transparent cursor-pointer"
                >
                  <option value="weapon">Weapon</option>
                  <option value="armor">Armor</option>
                  <option value="consumable">Consumable</option>
                  <option value="quest">Quest Item</option>
                  <option value="currency">Currency</option>
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label htmlFor="itemQuantity" className="block text-sm font-medium text-brand-text-primary mb-2">
                  Quantity
                </label>
                <input
                  id="itemQuantity"
                  type="number"
                  min="1"
                  value={newItem.quantity || 1}
                  onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent-primary focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="itemDescription" className="block text-sm font-medium text-brand-text-primary mb-2">
                  Description
                </label>
                <textarea
                  id="itemDescription"
                  value={newItem.description || ''}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  maxLength={200}
                  rows={3}
                  placeholder="Optional description"
                  className="w-full px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-primary placeholder:text-brand-text-muted focus:outline-none focus:ring-2 focus:ring-brand-accent-primary focus:border-transparent resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewItem({ name: '', type: 'consumable', quantity: 1, description: '' });
                    setError('');
                  }}
                  className="flex-1 px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-primary hover:bg-brand-surface-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 px-4 py-3 bg-brand-accent-primary hover:bg-brand-accent-secondary text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isUpdating ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

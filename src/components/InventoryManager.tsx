import { useState } from 'react';

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
}

export default function InventoryManager({
  inventory,
  onUpdateInventory,
  isUpdating = false,
  showTitle = true,
  allowManualAdd = false,
  maxSlots = 20,
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

  const getItemTypeIcon = (type: string) => {
    switch (type) {
    case 'weapon': return '⚔️';
    case 'armor': return '🛡️';
    case 'consumable': return '🧪';
    case 'quest': return '📜';
    case 'currency': return '💰';
    default: return '📦';
    }
  };

  const totalSlots = Math.max(maxSlots, inventory.length);
  const usedSlots = Math.min(inventory.length, totalSlots);
  const collapsedVisibleItems = 6;
  const visibleItems = isExpanded ? inventory : inventory.slice(0, collapsedVisibleItems);
  const hiddenItemCount = Math.max(inventory.length - visibleItems.length, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-nowrap">
        {showTitle ? <p className="shrink-0 whitespace-nowrap text-[11px] uppercase tracking-[0.24em] text-brand-text-muted">Inventory</p> : <span />}
        <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <span className="px-1 text-[10px] font-medium tracking-[0.08em] text-brand-text-muted whitespace-nowrap">
            {usedSlots}/{totalSlots}
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`retro-left-mode-button p-1.5 text-brand-text-primary transition-colors ${
              isExpanded ? 'retro-left-mode-button-active' : ''
            }`}
            aria-label={isExpanded ? 'Collapse inventory list' : 'Expand inventory list'}
          >
            <img
              src="/arrowExpand.svg"
              alt=""
              aria-hidden="true"
              className={`h-4 w-4 object-contain brightness-0 invert transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
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

      <div className="space-y-1.5">
        {visibleItems.length === 0 ? (
          <p className="text-sm text-brand-text-muted italic">No items in inventory</p>
        ) : (
          visibleItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 border-b border-brand-surface-border/20 py-2 last:border-b-0"
            >
              <div className="mt-0.5 text-sm leading-none" aria-hidden="true">{getItemTypeIcon(item.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-brand-text-primary truncate">
                    {item.name}
                  </h4>
                  {item.quantity && item.quantity > 1 && (
                    <span className="text-xs text-brand-text-muted">×{item.quantity}</span>
                  )}
                  <span className="text-[10px] uppercase tracking-wider text-brand-text-muted">
                    {item.type}
                  </span>
                </div>
                {item.equipped && (
                  <span className="mt-0.5 inline-block text-[10px] text-brand-accent-primary">
                    Equipped
                  </span>
                )}
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
        <p className="text-[10px] text-brand-text-muted">Expand to view {hiddenItemCount} more items.</p>
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

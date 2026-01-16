import type { ItemDefinition } from './types';

export const ITEMS: Record<string, ItemDefinition> = {
  // Weapons
  rustySword: {
    id: 'rustySword',
    name: 'Rusty Sword',
    description: 'A worn blade, better than nothing.',
    type: 'weapon',
    rarity: 'common',
    statModifiers: { strength: 1 },
    stackable: false,
  },
  
  ironSword: {
    id: 'ironSword',
    name: 'Iron Sword',
    description: 'A sturdy iron blade.',
    type: 'weapon',
    rarity: 'common',
    statModifiers: { strength: 2 },
    stackable: false,
  },
  
  flamingSword: {
    id: 'flamingSword',
    name: 'Flaming Sword',
    description: 'A blade wreathed in eternal flames.',
    type: 'weapon',
    rarity: 'rare',
    statModifiers: { strength: 3, charisma: 1 },
    effects: [{
      type: 'buff',
      duration: 'permanent',
      statModifiers: { intelligence: 1 },
      description: 'The flames illuminate your mind.',
    }],
    stackable: false,
  },
  
  // Armor
  leatherArmor: {
    id: 'leatherArmor',
    name: 'Leather Armor',
    description: 'Light and flexible protection.',
    type: 'armor',
    rarity: 'common',
    statModifiers: { dexterity: 1 },
    stackable: false,
  },
  
  chainMail: {
    id: 'chainMail',
    name: 'Chain Mail',
    description: 'Interlocking metal rings provide solid defense.',
    type: 'armor',
    rarity: 'uncommon',
    statModifiers: { constitution: 2 },
    stackable: false,
  },
  
  dragonScaleArmor: {
    id: 'dragonScaleArmor',
    name: 'Dragon Scale Armor',
    description: 'Legendary armor crafted from dragon scales.',
    type: 'armor',
    rarity: 'legendary',
    statModifiers: { constitution: 4, charisma: 2 },
    effects: [{
      type: 'buff',
      duration: 'permanent',
      statModifiers: { strength: 2 },
      description: 'The dragon\'s power flows through you.',
    }],
    stackable: false,
  },
  
  // Consumables
  healthPotion: {
    id: 'healthPotion',
    name: 'Health Potion',
    description: 'Restores 50 HP when consumed.',
    type: 'consumable',
    rarity: 'common',
    effects: [{
      type: 'heal',
      duration: 'temporary',
      value: 50,
      description: 'Heals 50 HP instantly.',
    }],
    stackable: true,
    maxStack: 99,
  },
  
  strengthElixir: {
    id: 'strengthElixir',
    name: 'Elixir of Strength',
    description: 'Temporarily increases strength by 3.',
    type: 'consumable',
    rarity: 'uncommon',
    effects: [{
      type: 'buff',
      duration: 'temporary',
      statModifiers: { strength: 3 },
      description: 'Strength +3 until next rest.',
    }],
    stackable: true,
    maxStack: 20,
  },
  
  // Magical Items
  ringOfWisdom: {
    id: 'ringOfWisdom',
    name: 'Ring of Wisdom',
    description: 'An enchanted ring that enhances perception.',
    type: 'magical',
    rarity: 'rare',
    statModifiers: { wisdom: 2, intelligence: 1 },
    stackable: false,
  },
  
  amuletOfProtection: {
    id: 'amuletOfProtection',
    name: 'Amulet of Protection',
    description: 'Grants resilience to the wearer.',
    type: 'magical',
    rarity: 'uncommon',
    statModifiers: { constitution: 2 },
    stackable: false,
  },
  
  cloakOfShadows: {
    id: 'cloakOfShadows',
    name: 'Cloak of Shadows',
    description: 'Makes the wearer harder to detect.',
    type: 'magical',
    rarity: 'rare',
    statModifiers: { dexterity: 3, charisma: 1 },
    stackable: false,
  },
  
  // Misc
  gold: {
    id: 'gold',
    name: 'Gold Coins',
    description: 'Currency accepted throughout the realm.',
    type: 'misc',
    rarity: 'common',
    stackable: true,
    maxStack: 9999,
  },
};

// Helper to get item by ID
export function getItem(itemId: string): ItemDefinition | undefined {
  return ITEMS[itemId];
}

// Get all available items
export function getAllItems(): ItemDefinition[] {
  return Object.values(ITEMS);
}

// Get items by type
export function getItemsByType(type: ItemDefinition['type']): ItemDefinition[] {
  return Object.values(ITEMS).filter(item => item.type === type);
}

// Get items by rarity
export function getItemsByRarity(rarity: ItemDefinition['rarity']): ItemDefinition[] {
  return Object.values(ITEMS).filter(item => item.rarity === rarity);
}

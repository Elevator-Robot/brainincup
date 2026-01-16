import type { ClassDefinition } from './types';

export const CLASSES: Record<string, ClassDefinition> = {
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    description: 'Master of martial combat and weapons.',
    baseStats: {
      strength: 15,
      dexterity: 12,
      constitution: 14,
      intelligence: 10,
      wisdom: 11,
      charisma: 10,
    },
    hitDieSize: 10,
    primaryStat: 'strength',
    skills: ['Athletics', 'Intimidation'],
    startingEquipment: ['Longsword', 'Shield', 'Chain Mail'],
  },
  
  wizard: {
    id: 'wizard',
    name: 'Wizard',
    description: 'Master of arcane magic and spellcasting.',
    baseStats: {
      strength: 8,
      dexterity: 12,
      constitution: 12,
      intelligence: 16,
      wisdom: 13,
      charisma: 10,
    },
    hitDieSize: 6,
    primaryStat: 'intelligence',
    skills: ['Arcana', 'Investigation'],
    startingEquipment: ['Spellbook', 'Component Pouch', 'Quarterstaff'],
  },
  
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    description: 'Stealthy and cunning, masters of deception.',
    baseStats: {
      strength: 10,
      dexterity: 16,
      constitution: 12,
      intelligence: 13,
      wisdom: 11,
      charisma: 12,
    },
    hitDieSize: 8,
    primaryStat: 'dexterity',
    skills: ['Stealth', 'Sleight of Hand', 'Thieves\' Tools'],
    startingEquipment: ['Shortsword', 'Dagger', 'Leather Armor', 'Thieves\' Tools'],
  },
  
  cleric: {
    id: 'cleric',
    name: 'Cleric',
    description: 'Divine spellcaster and healer.',
    baseStats: {
      strength: 12,
      dexterity: 10,
      constitution: 13,
      intelligence: 11,
      wisdom: 16,
      charisma: 12,
    },
    hitDieSize: 8,
    primaryStat: 'wisdom',
    skills: ['Medicine', 'Religion'],
    startingEquipment: ['Mace', 'Holy Symbol', 'Chain Mail'],
  },
  
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    description: 'Wilderness expert and tracker.',
    baseStats: {
      strength: 12,
      dexterity: 15,
      constitution: 13,
      intelligence: 11,
      wisdom: 14,
      charisma: 10,
    },
    hitDieSize: 10,
    primaryStat: 'dexterity',
    skills: ['Survival', 'Nature', 'Animal Handling'],
    startingEquipment: ['Longbow', 'Shortsword', 'Leather Armor'],
  },
  
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    description: 'Holy warrior sworn to an oath.',
    baseStats: {
      strength: 15,
      dexterity: 10,
      constitution: 14,
      intelligence: 10,
      wisdom: 12,
      charisma: 13,
    },
    hitDieSize: 10,
    primaryStat: 'strength',
    skills: ['Athletics', 'Religion'],
    startingEquipment: ['Longsword', 'Shield', 'Plate Armor', 'Holy Symbol'],
  },
  
  barbarian: {
    id: 'barbarian',
    name: 'Barbarian',
    description: 'Fierce warrior fueled by primal rage.',
    baseStats: {
      strength: 16,
      dexterity: 13,
      constitution: 15,
      intelligence: 8,
      wisdom: 11,
      charisma: 10,
    },
    hitDieSize: 12,
    primaryStat: 'strength',
    skills: ['Athletics', 'Intimidation', 'Survival'],
    startingEquipment: ['Greataxe', 'Handaxes', 'Hide Armor'],
  },
  
  bard: {
    id: 'bard',
    name: 'Bard',
    description: 'Charismatic performer with magical inspiration.',
    baseStats: {
      strength: 10,
      dexterity: 13,
      constitution: 12,
      intelligence: 12,
      wisdom: 11,
      charisma: 16,
    },
    hitDieSize: 8,
    primaryStat: 'charisma',
    skills: ['Performance', 'Persuasion', 'Musical Instrument'],
    startingEquipment: ['Rapier', 'Lute', 'Leather Armor'],
  },
  
  druid: {
    id: 'druid',
    name: 'Druid',
    description: 'Guardian of nature with shapeshifting power.',
    baseStats: {
      strength: 10,
      dexterity: 12,
      constitution: 13,
      intelligence: 12,
      wisdom: 16,
      charisma: 11,
    },
    hitDieSize: 8,
    primaryStat: 'wisdom',
    skills: ['Nature', 'Animal Handling', 'Survival'],
    startingEquipment: ['Quarterstaff', 'Leather Armor', 'Druidic Focus'],
  },
  
  monk: {
    id: 'monk',
    name: 'Monk',
    description: 'Martial artist harnessing ki energy.',
    baseStats: {
      strength: 12,
      dexterity: 16,
      constitution: 13,
      intelligence: 11,
      wisdom: 14,
      charisma: 10,
    },
    hitDieSize: 8,
    primaryStat: 'dexterity',
    skills: ['Acrobatics', 'Stealth', 'Athletics'],
    startingEquipment: ['Quarterstaff', 'Darts', 'Simple Robes'],
  },
  
  sorcerer: {
    id: 'sorcerer',
    name: 'Sorcerer',
    description: 'Innate magical power from bloodline.',
    baseStats: {
      strength: 8,
      dexterity: 12,
      constitution: 13,
      intelligence: 12,
      wisdom: 11,
      charisma: 16,
    },
    hitDieSize: 6,
    primaryStat: 'charisma',
    skills: ['Arcana', 'Persuasion'],
    startingEquipment: ['Quarterstaff', 'Component Pouch', 'Robes'],
  },
  
  warlock: {
    id: 'warlock',
    name: 'Warlock',
    description: 'Wielder of power granted by otherworldly patron.',
    baseStats: {
      strength: 10,
      dexterity: 12,
      constitution: 13,
      intelligence: 12,
      wisdom: 11,
      charisma: 16,
    },
    hitDieSize: 8,
    primaryStat: 'charisma',
    skills: ['Arcana', 'Deception', 'Intimidation'],
    startingEquipment: ['Crossbow', 'Leather Armor', 'Arcane Focus'],
  },
  
  wanderer: {
    id: 'wanderer',
    name: 'Wanderer',
    description: 'Jack-of-all-trades adventurer seeking fortune.',
    baseStats: {
      strength: 10,
      dexterity: 12,
      constitution: 14,
      intelligence: 13,
      wisdom: 13,
      charisma: 11,
    },
    hitDieSize: 8,
    primaryStat: 'constitution',
    skills: ['Survival', 'Perception'],
    startingEquipment: ['Sword', 'Backpack', 'Leather Armor'],
  },
};

// Helper to get class by ID
export function getClass(classId: string): ClassDefinition | undefined {
  return CLASSES[classId];
}

// Get all available classes
export function getAllClasses(): ClassDefinition[] {
  return Object.values(CLASSES);
}

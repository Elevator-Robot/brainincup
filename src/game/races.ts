import type { RaceDefinition } from './types';

// Based on D&D 5e racial stat distributions
// Each race has complete base stats (no modifiers, these ARE the base)

export const RACES: Record<string, RaceDefinition> = {
  terran: {
    id: 'terran',
    name: 'Terran',
    description: 'Adaptable and resilient people of the central realms.',
    baseStats: {
      strength: 11,
      dexterity: 11,
      constitution: 11,
      intelligence: 11,
      wisdom: 11,
      charisma: 11,
    },
    traits: ['Versatile', 'Quick Learner', 'Extra Skill'],
    size: 'Medium',
    speed: 30,
  },

  goblin: {
    id: 'goblin',
    name: 'Goblin',
    description: 'Cunning and quick, goblins excel at survival and opportunism.',
    baseStats: {
      strength: 8,
      dexterity: 13,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 9,
    },
    traits: ['Nimble Escape', 'Darkvision', 'Scavenger Instinct'],
    size: 'Small',
    speed: 30,
  },
  
  elvin: {
    id: 'elvin',
    name: 'Elvin',
    description: 'Graceful and perceptive, the Elvin are deeply attuned to magic and nature.',
    baseStats: {
      strength: 8,
      dexterity: 12,
      constitution: 9,
      intelligence: 11,
      wisdom: 11,
      charisma: 10,
    },
    traits: ['Darkvision', 'Keen Senses', 'Fey Ancestry', 'Trance'],
    size: 'Medium',
    speed: 30,
  },
  
  troll: {
    id: 'troll',
    name: 'Troll',
    description: 'Massive and relentless, trolls endure wounds others cannot.',
    baseStats: {
      strength: 13,
      dexterity: 8,
      constitution: 13,
      intelligence: 8,
      wisdom: 10,
      charisma: 8,
    },
    traits: ['Regenerative Vigor', 'Brutal Frame', 'Darkvision'],
    size: 'Large',
    speed: 30,
  },
  
  halfling: {
    id: 'halfling',
    name: 'Halfling',
    description: 'Small and nimble, halflings are lucky and brave.',
    baseStats: {
      strength: 8,
      dexterity: 12,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 11,
    },
    traits: ['Lucky', 'Brave', 'Nimble', 'Halfling Courage'],
    size: 'Small',
    speed: 25,
  },
  
  orc: {
    id: 'orc',
    name: 'Orc',
    description: 'Powerful and direct, orcs are fierce in battle and loyal in kinship.',
    baseStats: {
      strength: 13,
      dexterity: 9,
      constitution: 12,
      intelligence: 8,
      wisdom: 10,
      charisma: 9,
    },
    traits: ['Adrenaline Rush', 'Powerful Build', 'Menacing'],
    size: 'Medium',
    speed: 30,
  },

  halfOrc: {
    id: 'halfOrc',
    name: 'Half-Orc',
    description: 'Strong and enduring, with orcish ferocity.',
    baseStats: {
      strength: 12,
      dexterity: 10,
      constitution: 11,
      intelligence: 9,
      wisdom: 10,
      charisma: 9,
    },
    traits: ['Darkvision', 'Relentless Endurance', 'Savage Attacks', 'Menacing'],
    size: 'Medium',
    speed: 30,
  },
  
};

// Helper to get race by ID
export function getRace(raceId: string): RaceDefinition | undefined {
  return RACES[raceId];
}

// Get all available races
export function getAllRaces(): RaceDefinition[] {
  return Object.values(RACES);
}

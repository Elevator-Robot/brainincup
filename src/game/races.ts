import type { RaceDefinition } from './types';

// Based on D&D 5e racial stat distributions
// Each race has complete base stats (no modifiers, these ARE the base)

export const RACES: Record<string, RaceDefinition> = {
  human: {
    id: 'human',
    name: 'Human',
    description: 'Versatile and adaptable, humans are found across all lands.',
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
  
  elf: {
    id: 'elf',
    name: 'Elf',
    description: 'Graceful and perceptive, elves are attuned to magic and nature.',
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
  
  dwarf: {
    id: 'dwarf',
    name: 'Dwarf',
    description: 'Hardy and resilient, dwarves are master craftsmen and warriors.',
    baseStats: {
      strength: 11,
      dexterity: 9,
      constitution: 12,
      intelligence: 10,
      wisdom: 11,
      charisma: 9,
    },
    traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning', 'Tool Proficiency'],
    size: 'Medium',
    speed: 25,
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
  
  dragonborn: {
    id: 'dragonborn',
    name: 'Dragonborn',
    description: 'Proud dragon-blooded warriors with elemental breath.',
    baseStats: {
      strength: 12,
      dexterity: 10,
      constitution: 11,
      intelligence: 10,
      wisdom: 10,
      charisma: 11,
    },
    traits: ['Draconic Ancestry', 'Breath Weapon', 'Damage Resistance'],
    size: 'Medium',
    speed: 30,
  },
  
  gnome: {
    id: 'gnome',
    name: 'Gnome',
    description: 'Curious and inventive, gnomes have a magical affinity.',
    baseStats: {
      strength: 8,
      dexterity: 10,
      constitution: 10,
      intelligence: 12,
      wisdom: 10,
      charisma: 10,
    },
    traits: ['Darkvision', 'Gnome Cunning', 'Artificer\'s Lore', 'Tinker'],
    size: 'Small',
    speed: 25,
  },
  
  halfElf: {
    id: 'halfElf',
    name: 'Half-Elf',
    description: 'Blending human versatility with elven grace.',
    baseStats: {
      strength: 10,
      dexterity: 11,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 12,
    },
    traits: ['Darkvision', 'Fey Ancestry', 'Skill Versatility'],
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
  
  tiefling: {
    id: 'tiefling',
    name: 'Tiefling',
    description: 'Bearing infernal heritage with innate magical abilities.',
    baseStats: {
      strength: 9,
      dexterity: 10,
      constitution: 10,
      intelligence: 11,
      wisdom: 10,
      charisma: 12,
    },
    traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy'],
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

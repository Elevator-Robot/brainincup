// Core game mechanics types

export interface Stats {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface StatModifiers {
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
}

export interface DerivedStats {
  maxHP: number;
  armorClass: number;
  initiative: number;
  spellPower?: number;
}

export interface RaceDefinition {
  id: string;
  name: string;
  description: string;
  baseStats: Stats; // Each race has its own base stats
  traits: string[];
  size: 'Small' | 'Medium' | 'Large';
  speed: number;
}

export interface ClassDefinition {
  id: string;
  name: string;
  description: string;
  baseStats: Stats;
  hitDieSize: number;
  primaryStat: keyof Stats;
  skills: string[];
  startingEquipment: string[];
}

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  type: 'weapon' | 'armor' | 'consumable' | 'magical' | 'misc';
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  statModifiers?: StatModifiers;
  effects?: ItemEffect[];
  stackable: boolean;
  maxStack?: number;
}

export interface ItemEffect {
  type: 'buff' | 'debuff' | 'heal' | 'damage';
  duration: 'permanent' | 'temporary';
  statModifiers?: StatModifiers;
  value?: number;
  description: string;
}

export interface ActiveEffect {
  id: string;
  name: string;
  description: string;
  statModifiers: StatModifiers;
  duration: 'permanent' | 'temporary';
  turnsRemaining?: number;
  source: string;
}

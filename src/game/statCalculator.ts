import type { Stats, StatModifiers, DerivedStats, ActiveEffect } from './types';
import { getRace } from './races';
import { getClass } from './classes';

/**
 * Apply stat modifiers to base stats
 */
export function applyModifiers(base: Stats, ...modifiers: StatModifiers[]): Stats {
  const result: Stats = { ...base };
  
  for (const modifier of modifiers) {
    if (modifier.strength) result.strength += modifier.strength;
    if (modifier.dexterity) result.dexterity += modifier.dexterity;
    if (modifier.constitution) result.constitution += modifier.constitution;
    if (modifier.intelligence) result.intelligence += modifier.intelligence;
    if (modifier.wisdom) result.wisdom += modifier.wisdom;
    if (modifier.charisma) result.charisma += modifier.charisma;
  }
  
  return result;
}

/**
 * Calculate final stats from class and race
 * Formula: (Class Base Stats + Race Base Stats) / 2, then add item/effect modifiers
 */
export function calculateFinalStats(
  classId: string,
  raceId: string,
  activeEffects: ActiveEffect[] = []
): Stats {
  const classData = getClass(classId);
  const raceData = getRace(raceId);
  
  if (!classData || !raceData) {
    throw new Error(`Invalid class (${classId}) or race (${raceId})`);
  }
  
  // Combine class and race stats (average of both, then round)
  const finalStats: Stats = {
    strength: Math.round((classData.baseStats.strength + raceData.baseStats.strength) / 2),
    dexterity: Math.round((classData.baseStats.dexterity + raceData.baseStats.dexterity) / 2),
    constitution: Math.round((classData.baseStats.constitution + raceData.baseStats.constitution) / 2),
    intelligence: Math.round((classData.baseStats.intelligence + raceData.baseStats.intelligence) / 2),
    wisdom: Math.round((classData.baseStats.wisdom + raceData.baseStats.wisdom) / 2),
    charisma: Math.round((classData.baseStats.charisma + raceData.baseStats.charisma) / 2),
  };
  
  // Apply active effect modifiers
  for (const effect of activeEffects) {
    const modified = applyModifiers(finalStats, effect.statModifiers);
    Object.assign(finalStats, modified);
  }
  
  return finalStats;
}

/**
 * Calculate derived stats from final stats
 */
export function calculateDerivedStats(stats: Stats, classId: string, level: number): DerivedStats {
  const classData = getClass(classId);
  if (!classData) {
    throw new Error(`Invalid class: ${classId}`);
  }
  
  // Calculate CON modifier
  const conModifier = Math.floor((stats.constitution - 10) / 2);
  
  // Calculate DEX modifier
  const dexModifier = Math.floor((stats.dexterity - 10) / 2);
  
  // Calculate INT modifier
  const intModifier = Math.floor((stats.intelligence - 10) / 2);
  
  // Max HP = (Hit Die + CON modifier) per level
  const maxHP = (classData.hitDieSize + conModifier) * level;
  
  // Armor Class = 10 + DEX modifier (simplified, equipment adds to this)
  const armorClass = 10 + dexModifier;
  
  // Initiative = DEX modifier
  const initiative = dexModifier;
  
  // Spell Power (for casters) = INT/WIS/CHA modifier depending on class
  let spellPower: number | undefined;
  if (classData.primaryStat === 'intelligence') {
    spellPower = intModifier;
  } else if (classData.primaryStat === 'wisdom') {
    spellPower = Math.floor((stats.wisdom - 10) / 2);
  } else if (classData.primaryStat === 'charisma') {
    spellPower = Math.floor((stats.charisma - 10) / 2);
  }
  
  return {
    maxHP,
    armorClass,
    initiative,
    spellPower,
  };
}

/**
 * Get stat modifier from stat value (D&D 5e formula)
 */
export function getStatModifier(statValue: number): number {
  return Math.floor((statValue - 10) / 2);
}

/**
 * Format stats for AI context
 * This creates a string that describes the character's capabilities
 */
export function formatStatsForAI(
  stats: Stats,
  derivedStats: DerivedStats,
  classId: string,
  raceId: string,
  level: number
): string {
  const classData = getClass(classId);
  const raceData = getRace(raceId);
  
  if (!classData || !raceData) return '';
  
  const lines: string[] = [
    `Character Stats:`,
    `- Class: ${classData.name} (Level ${level})`,
    `- Race: ${raceData.name}`,
    ``,
    `Core Attributes:`,
    `- Strength: ${stats.strength} (${getStatModifier(stats.strength) >= 0 ? '+' : ''}${getStatModifier(stats.strength)})`,
    `- Dexterity: ${stats.dexterity} (${getStatModifier(stats.dexterity) >= 0 ? '+' : ''}${getStatModifier(stats.dexterity)})`,
    `- Constitution: ${stats.constitution} (${getStatModifier(stats.constitution) >= 0 ? '+' : ''}${getStatModifier(stats.constitution)})`,
    `- Intelligence: ${stats.intelligence} (${getStatModifier(stats.intelligence) >= 0 ? '+' : ''}${getStatModifier(stats.intelligence)})`,
    `- Wisdom: ${stats.wisdom} (${getStatModifier(stats.wisdom) >= 0 ? '+' : ''}${getStatModifier(stats.wisdom)})`,
    `- Charisma: ${stats.charisma} (${getStatModifier(stats.charisma) >= 0 ? '+' : ''}${getStatModifier(stats.charisma)})`,
    ``,
    `Combat Stats:`,
    `- HP: ${derivedStats.maxHP}`,
    `- Armor Class: ${derivedStats.armorClass}`,
    `- Initiative: ${derivedStats.initiative >= 0 ? '+' : ''}${derivedStats.initiative}`,
  ];
  
  if (derivedStats.spellPower !== undefined) {
    lines.push(`- Spell Power: ${derivedStats.spellPower >= 0 ? '+' : ''}${derivedStats.spellPower}`);
  }
  
  if (raceData.traits.length > 0) {
    lines.push('', `Racial Traits: ${raceData.traits.join(', ')}`);
  }
  
  if (classData.skills.length > 0) {
    lines.push(`Class Skills: ${classData.skills.join(', ')}`);
  }
  
  return lines.join('\n');
}

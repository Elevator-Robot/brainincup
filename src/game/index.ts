// Main exports for the game mechanics system

export * from './types';
export * from './races';
export * from './classes';
export * from './items';
export * from './statCalculator';

// Re-export commonly used functions
export { getRace, getAllRaces } from './races';
export { getClass, getAllClasses } from './classes';
export { getItem, getAllItems, getItemsByType, getItemsByRarity } from './items';
export {
  calculateFinalStats,
  calculateDerivedStats,
  applyModifiers,
  getStatModifier,
  formatStatsForAI,
} from './statCalculator';

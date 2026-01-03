/**
 * Feature flags for controlling UI elements and features
 */

export const featureFlags = {
  // Show WIP banner for Game Master mode
  showGameMasterWIPBanner: true,
  
  // Future flags can be added here
} as const;

export type FeatureFlags = typeof featureFlags;

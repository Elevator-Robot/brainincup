const INVALID_LOCATION_VALUES = new Set(['unknown', 'n/a']);

export const DEFAULT_GAME_MASTER_LOCATION = 'The Shadowed Forrest';

export const resolveGameMasterLocation = (
  ...candidates: Array<string | null | undefined>
): string => {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (INVALID_LOCATION_VALUES.has(trimmed.toLowerCase())) continue;
    return trimmed;
  }
  return DEFAULT_GAME_MASTER_LOCATION;
};

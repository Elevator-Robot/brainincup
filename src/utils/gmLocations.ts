// The orchestrator persists location as a content KEY (e.g. `whispering_tankard`).
// Resolve the key to the display name shown in the header / context windows, and
// leave already-human strings (legacy free-text like "The Shrouded Vale") untouched.
export const GM_LOCATION_NAMES: Record<string, string> = {
  alderheart_square: 'Alderheart Market Square',
  whispering_tankard: 'The Whispering Tankard',
  town_gate: 'The Market Stalls at the Gate',
  market_tavern_cellar: 'The Tankard Cellar',
};
export const GM_PLACEHOLDER_LOCATION = 'The Shrouded Vale';

export const resolveLocationName = (value: string | null | undefined): string => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  return GM_LOCATION_NAMES[trimmed] ?? trimmed;
};

type AdventureLike = {
  currentLocation?: string | null;
  lastLocation?: string | null;
  updatedAt?: string | null;
};

// Pick the authoritative GameMasterAdventure row. The orchestrator persists a
// content-key location (e.g. `alderheart_square`) on its own row, while frontend
// stubs and legacy rows keep the placeholder schema default. Raw orchestrator
// writes use "+00:00" suffixes that sort BEFORE AppSync's "Z" timestamps, so any
// non-empty check can pick the placeholder stub. Exclude placeholder rows first,
// then take the most recently updated remaining row.
export const pickLatestAdventure = <T extends AdventureLike>(items: T[] | null | undefined): T | null => {
  const list = (items ?? []).filter((it): it is T => Boolean(it));
  const hasRealLocation = (it: T) =>
    !!it.currentLocation &&
    typeof it.currentLocation === 'string' &&
    it.currentLocation.trim() !== '' &&
    it.currentLocation.trim() !== GM_PLACEHOLDER_LOCATION;
  const candidates = list.some(hasRealLocation) ? list.filter(hasRealLocation) : list;
  return (
    [...candidates].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0] ?? null
  );
};
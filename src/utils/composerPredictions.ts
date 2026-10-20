/**
 * Lightweight, local next-phrase suggestions for the composer. The goal is a
 * single useful tail (shown as ghost text), not an exhaustive grammar: the
 * player stays in charge and Tab accepts only when it actually helps.
 */
const GAME_MASTER_COMPLETIONS: Array<[prefix: string, tail: string]> = [
  ['i look', ' around carefully.'],
  ['i check', ' my inventory.'],
  ['i search', ' the area for anything useful.'],
  ['i listen', ' for anything out of place.'],
  ['i follow', ' the tracks.'],
  ['i ask', ' about what happened here.'],
  ['i draw', ' my weapon.'],
  ['i approach', ' slowly, hands visible.'],
  ['i examine', ' it more closely.'],
  ['i head', ' toward the light.'],
  ['i wait', ' and watch for movement.'],
  ['let me', ' take a closer look.'],
  ['can i', ' look around?'],
];

const BRAIN_COMPLETIONS: Array<[prefix: string, tail: string]> = [
  ['can you', ' explain that more simply?'],
  ['help me', ' think through the tradeoffs.'],
  ['what if', ' we approached it differently?'],
  ['give me', ' a concrete example.'],
  ['summarize', ' the key points so far.'],
  ['how do i', ' get started?'],
  ['show me', ' how that would work.'],
];

export function predictCompletion(value: string, isGameMasterMode: boolean): string {
  if (value.length < 2 || value.includes('\n') || value.trimStart().startsWith('/')) return '';
  if (/\s$/.test(value)) return '';
  const bank = isGameMasterMode ? GAME_MASTER_COMPLETIONS : BRAIN_COMPLETIONS;
  const normalized = value.toLowerCase();
  for (const [prefix, tail] of bank) {
    if (prefix.startsWith(normalized)) return `${prefix.slice(normalized.length)}${tail}`;
  }
  return '';
}

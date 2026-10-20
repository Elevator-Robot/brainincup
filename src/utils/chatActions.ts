export type ChatActionIcon =
  | 'eye' | 'speech' | 'search' | 'bag' | 'scroll' | 'die'
  | 'spark' | 'list' | 'map' | 'bulb' | 'pen' | 'quote';

export interface ChatAction {
  id: string;
  label: string;
  /** Slash command name, without the leading slash. */
  command: string;
  prompt: string;
  hint: string;
  icon: ChatActionIcon;
}

/** Game-master verbs. The first four double as the inline quick-action pills. */
export const GAME_MASTER_ACTIONS: ChatAction[] = [
  { id: 'look', label: 'Look around', command: 'look', prompt: 'I look around carefully. What catches my attention?', hint: 'Survey the scene', icon: 'eye' },
  { id: 'talk', label: 'Talk', command: 'talk', prompt: 'I approach someone nearby and start a conversation.', hint: 'Speak to someone here', icon: 'speech' },
  { id: 'search', label: 'Search', command: 'search', prompt: 'I search the area for anything useful or out of place.', hint: 'Hunt for clues', icon: 'search' },
  { id: 'inventory', label: 'Inventory', command: 'inventory', prompt: 'I check my inventory.', hint: 'Review what you carry', icon: 'bag' },
  { id: 'quests', label: 'Quests', command: 'quests', prompt: 'I review my active quests.', hint: 'Recall your objectives', icon: 'scroll' },
  { id: 'roll', label: 'Roll', command: 'roll', prompt: 'I attempt something risky and roll for it.', hint: 'Test your luck', icon: 'die' },
];

export const GM_QUICK_ACTION_IDS = ['look', 'talk', 'inventory', 'quests'] as const;

export const BRAIN_ACTIONS: ChatAction[] = [
  { id: 'explain', label: 'Explain', command: 'explain', prompt: 'Explain this simply, with a concrete example.', hint: 'Break down a concept', icon: 'spark' },
  { id: 'summarize', label: 'Summarize', command: 'summarize', prompt: 'Summarize the key points so far.', hint: 'Condense the thread', icon: 'list' },
  { id: 'plan', label: 'Plan', command: 'plan', prompt: 'Help me turn this into a practical step-by-step plan.', hint: 'Map the next steps', icon: 'map' },
  { id: 'brainstorm', label: 'Brainstorm', command: 'brainstorm', prompt: 'Give me five distinct ideas, from safe to wild.', hint: 'Generate options', icon: 'bulb' },
  { id: 'rewrite', label: 'Rewrite', command: 'rewrite', prompt: 'Rewrite that more clearly while keeping the meaning.', hint: 'Sharpen the wording', icon: 'pen' },
  { id: 'example', label: 'Example', command: 'example', prompt: 'Show me a concrete example.', hint: 'See it in practice', icon: 'quote' },
];

export function actionsForMode(isGameMasterMode: boolean): ChatAction[] {
  return isGameMasterMode ? GAME_MASTER_ACTIONS : BRAIN_ACTIONS;
}

export function quickActionsForMode(isGameMasterMode: boolean): ChatAction[] {
  if (!isGameMasterMode) return [];
  return GM_QUICK_ACTION_IDS
    .map(id => GAME_MASTER_ACTIONS.find(action => action.id === id))
    .filter((action): action is ChatAction => Boolean(action));
}

export function filterActions(actions: ChatAction[], query: string): ChatAction[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return actions;
  return actions.filter(action =>
    action.command.startsWith(normalized) || action.label.toLowerCase().includes(normalized));
}

/** Append a staged action to an existing draft without losing what is there. */
export function appendPrompt(draft: string, prompt: string): string {
  const base = draft.trimEnd();
  if (!base) return prompt;
  return `${base}\n${prompt}`;
}

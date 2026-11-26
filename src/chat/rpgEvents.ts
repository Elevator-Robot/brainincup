import { parseDiceRollRequest, type DiceRollRequest } from '../utils/diceRolls';

/** Engine facts only. Both AWSJSON history and live SSE use this boundary. */
export interface RpgEvent {
  version: 1;
  id: string;
  kind: string;
  title: string;
  detail: string;
  data?: Record<string, unknown>;
}

export interface StorySnapshot {
  version: 1;
  stageId: string;
  title: string;
  objective: string;
  introComplete: boolean;
  questionIndex: number;
  questionCount: number;
  details: { id: string; title: string; answer: string }[];
  memoryStatus: 'local' | 'pending' | 'synced';
  quest?: { id: string; title: string; status: string; objective: string };
  progression?: { currentXP: number; currentLevel: number; xpToNextLevel: number };
  pendingDiceRoll?: DiceRollRequest | null;
  character?: ReturnType<typeof characterSnapshotPatch>;
  location?: string;
}

function decode(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return undefined; }
}
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === 'string';

export function parseRpgEvents(value: unknown): RpgEvent[] {
  const decoded = decode(value);
  if (!Array.isArray(decoded)) return [];
  const seen = new Set<string>();
  return decoded.filter((item): item is RpgEvent => {
    if (!object(item) || item.version !== 1 || !text(item.id) || !item.id
      || !text(item.kind) || !text(item.title) || !text(item.detail) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 32);
}

export function parseStorySnapshot(value: unknown): StorySnapshot | undefined {
  const item = decode(value);
  if (!object(item) || item.version !== 1 || !text(item.stageId) || !text(item.title) || !text(item.objective)) return;
  return {
    version: 1, stageId: item.stageId, title: item.title, objective: item.objective,
    introComplete: item.introComplete === true,
    questionIndex: typeof item.questionIndex === 'number' ? item.questionIndex : 0,
    questionCount: typeof item.questionCount === 'number' ? item.questionCount : 4,
    memoryStatus: item.memoryStatus === 'synced' || item.memoryStatus === 'pending' ? item.memoryStatus : 'local',
    pendingDiceRoll: parseDiceRollRequest(item.pendingDiceRoll),
    character: object(item.character) ? characterSnapshotPatch(item.character) : undefined,
    location: text(item.location) ? item.location : undefined,
    quest: object(item.quest) && text(item.quest.id) && text(item.quest.title) && text(item.quest.status) && text(item.quest.objective)
      ? { id: item.quest.id, title: item.quest.title, status: item.quest.status, objective: item.quest.objective } : undefined,
    progression: object(item.progression) && typeof item.progression.currentXP === 'number'
      && typeof item.progression.currentLevel === 'number' && typeof item.progression.xpToNextLevel === 'number'
      ? { currentXP: item.progression.currentXP, currentLevel: item.progression.currentLevel, xpToNextLevel: item.progression.xpToNextLevel } : undefined,
    details: Array.isArray(item.details) ? item.details.filter((detail): detail is StorySnapshot['details'][number] =>
      object(detail) && text(detail.id) && text(detail.title) && text(detail.answer)).slice(0, 20) : [],
  };
}

export function rpgResponseFields(value: { gameEvents?: unknown; story?: unknown }) {
  return { gameEvents: parseRpgEvents(value.gameEvents), story: parseStorySnapshot(value.story) };
}

/** Patch only authoritative fields actually present in a state snapshot. */
export function characterSnapshotPatch(value: unknown) {
  const patch: { currentHP?: number; maxHP?: number; level?: number; experience?: number; armorClass?: number; inventory?: string } = {};
  if (!object(value)) return patch;
  for (const key of ['currentHP', 'maxHP', 'level', 'armorClass'] as const) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) patch[key] = value[key];
  }
  if (typeof value.xp === 'number' && Number.isFinite(value.xp)) patch.experience = value.xp;
  if (Array.isArray(value.inventory)) patch.inventory = JSON.stringify(value.inventory);
  return patch;
}

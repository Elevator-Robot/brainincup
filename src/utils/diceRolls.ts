export const DICE_ROLL_DURATION_MS = 4800;

export interface DiceRollRequest {
  requestId: string;
  statName: string;
  statValue?: number;
  difficultyClass?: number;
  description?: string;
  expiresAt?: string;
}

export interface ChatDiceRoll extends DiceRollRequest {
  phase: 'pending' | 'rolling' | 'submitting' | 'submitted' | 'error' | 'cancelled';
  value?: number;
  startedAt?: number;
  duration?: number;
}

export function parseDiceRollRequest(value: unknown): DiceRollRequest | null {
  if (typeof value === 'string') {
    try { return parseDiceRollRequest(JSON.parse(value)); } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.requestId !== 'string' || !candidate.requestId.trim()) return null;
  if (typeof candidate.expiresAt === 'string' && !Number.isFinite(Date.parse(candidate.expiresAt))) return null;
  return {
    requestId: candidate.requestId,
    statName: typeof candidate.statName === 'string' ? candidate.statName : 'ability',
    statValue: typeof candidate.statValue === 'number' && Number.isFinite(candidate.statValue) ? candidate.statValue : undefined,
    difficultyClass: typeof candidate.difficultyClass === 'number' && Number.isFinite(candidate.difficultyClass) ? candidate.difficultyClass : undefined,
    description: typeof candidate.description === 'string' ? candidate.description : undefined,
    expiresAt: typeof candidate.expiresAt === 'string' ? candidate.expiresAt : undefined,
  };
}

export const isDiceRollExpired = (request: DiceRollRequest): boolean =>
  Boolean(request.expiresAt && Date.parse(request.expiresAt) <= Date.now());

export function rollD20(): number {
  const random = new Uint32Array(1);
  // Reject the incomplete range so every face is equally likely.
  do { crypto.getRandomValues(random); } while (random[0] >= 4_294_967_280);
  return random[0] % 20 + 1;
}

export function isDiceResultPayload(content: string): boolean {
  try { return JSON.parse(content)?.type === 'DICE_RESULT'; } catch { return false; }
}

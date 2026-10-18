import { useCallback, useEffect, useRef, useState } from 'react';
import { DICE_SIDES, getVisualDice, type VisualDie } from '../game/dice';
import { DICE_ROLL_DURATION_MS, rollDie } from '../utils/diceRolls';
import type { DieRollMotion } from '../components/dice/types';

export const PREVIEW_DICE = DICE_SIDES.flatMap(sides => getVisualDice(sides));

interface PreviewRoll extends DieRollMotion {
  value: number;
  face: number;
  nextFaceAt: number;
}

function faceForDie(die: VisualDie, sample: number) {
  if (die.kind === 'percentile') return sample % 10 * 10;
  if (die.id === 'd100-units') return sample % 10;
  return sample;
}

/** Independent values, locks and clocks; one die never starts another's roll. */
export function useDicePreviewRolls(reducedMotion: boolean) {
  const [rolls, setRolls] = useState<Record<string, PreviewRoll>>({});
  const current = useRef(rolls);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>();

  const tick = useCallback(function advance() {
    timer.current = undefined;
    const now = Date.now();
    const next = { ...current.current };
    let delay = Infinity;
    for (const die of PREVIEW_DICE) {
      const state = next[die.id];
      if (!state?.isRolling) continue;
      const elapsed = now - state.rollNonce;
      if (elapsed >= state.duration) {
        next[die.id] = { ...state, isRolling: false, face: state.value };
        continue;
      }
      if (now >= state.nextFaceAt) {
        const sides = die.kind === 'percentile' ? 10 : die.kind;
        const slowdown = Math.max(0, (elapsed / state.duration - .45) / .55);
        next[die.id] = {
          ...state,
          face: faceForDie(die, Math.floor(Math.random() * sides) + 1),
          nextFaceAt: now + 48 + 390 * slowdown ** 2.2,
        };
      }
      delay = Math.min(delay, next[die.id].nextFaceAt - now, state.duration - elapsed);
    }
    current.current = next;
    setRolls(next);
    if (Number.isFinite(delay)) timer.current = setTimeout(advance, Math.max(1, delay));
  }, []);

  const roll = useCallback((id: string) => {
    const die = PREVIEW_DICE.find(candidate => candidate.id === id);
    if (!die || current.current[id]?.isRolling) return;
    const now = Date.now();
    const value = faceForDie(die, rollDie(die.kind === 'percentile' ? 10 : die.kind));
    const next = { ...current.current, [id]: {
      value, face: value, rollNonce: now, duration: reducedMotion ? 0 : DICE_ROLL_DURATION_MS,
      isRolling: !reducedMotion, nextFaceAt: now,
    } };
    current.current = next;
    setRolls(next);
    if (!reducedMotion && timer.current === undefined) timer.current = setTimeout(tick, 0);
  }, [reducedMotion, tick]);

  useEffect(() => {
    if (!reducedMotion) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    const next = Object.fromEntries(Object.entries(current.current).map(([id, state]) => [id, { ...state, isRolling: false, face: state.value }]));
    current.current = next;
    setRolls(next);
  }, [reducedMotion]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const dice = PREVIEW_DICE.map(die => {
    const state = rolls[die.id];
    const value = state ? String(state.isRolling ? state.face : state.value) : undefined;
    return { ...die, value: die.kind === 'percentile' && value !== undefined ? value.padStart(2, '0') : value };
  });
  return { dice, rolls, roll, rollingCount: Object.values(rolls).filter(state => state.isRolling).length };
}

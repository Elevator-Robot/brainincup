import { useEffect, useId, useState } from 'react';
import DiceRoller from './DiceRoller';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { DICE_ROLL_DURATION_MS, isDiceRollExpired, type ChatDiceRoll } from '../utils/diceRolls';

interface ChatDicePromptProps {
  roll: ChatDiceRoll;
  active: boolean;
  disabled?: boolean;
  onRoll?: (requestId: string) => void;
}

export default function ChatDicePrompt({ roll, active, disabled, onRoll }: ChatDicePromptProps) {
  const titleId = useId();
  const descriptionId = useId();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [face, setFace] = useState(1);
  const [expired, setExpired] = useState(() => isDiceRollExpired(roll));
  const rolling = roll.phase === 'rolling';
  useEffect(() => {
    if (!roll.expiresAt) return;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, Date.parse(roll.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [roll.expiresAt]);
  useEffect(() => {
    if (!rolling || reducedMotion) return;
    let timer = 0;
    const tick = () => {
      const elapsed = Date.now() - (roll.startedAt ?? Date.now());
      const duration = roll.duration ?? DICE_ROLL_DURATION_MS;
      if (elapsed >= duration) { setFace(roll.value ?? 1); return; }
      setFace(previous => {
        const next = Math.floor(Math.random() * 20) + 1;
        return next === previous ? next % 20 + 1 : next;
      });
      // Quick early flashes ease into a few distinct, slower numbers at the end.
      const slowdown = Math.max(0, (elapsed / duration - .45) / .55);
      timer = window.setTimeout(tick, Math.min(duration - elapsed, 48 + 390 * Math.pow(slowdown, 2.2)));
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [rolling, reducedMotion, roll.startedAt, roll.duration, roll.value]);

  const settled = roll.value !== undefined && !rolling;
  const unavailable = !active || expired || roll.phase === 'cancelled';
  const modifier = roll.statValue === undefined ? null : Math.floor((roll.statValue - 10) / 2);
  const signedModifier = modifier === null ? '' : modifier >= 0 ? `+ ${modifier}` : `− ${Math.abs(modifier)}`;
  const label = rolling ? 'Rolling…' : roll.phase === 'submitting' ? 'Sending result…' : roll.phase === 'submitted' ? 'Roll recorded'
    : unavailable ? 'Check no longer active' : roll.phase === 'error' ? 'Send result again' : 'Roll d20';
  const number = rolling && !reducedMotion ? String(face) : roll.value === undefined ? '20' : String(roll.value);

  return <section className="cosmic-roll-prompt" data-phase={roll.phase} data-revealed={settled || undefined} aria-labelledby={titleId}>
    <header className="cosmic-roll-heading">
      <h3 id={titleId}>{roll.statName.replace(/_/g, ' ')} check</h3>
      {roll.difficultyClass !== undefined && <span aria-label={`Difficulty ${roll.difficultyClass}`}>DC {roll.difficultyClass}</span>}
    </header>
    {roll.description && <p id={descriptionId} className="sr-only">{roll.description}</p>}
    <button type="button" className="cosmic-roll-trigger" aria-label={label} aria-describedby={roll.description ? descriptionId : undefined}
      onClick={() => onRoll?.(roll.requestId)} disabled={disabled || unavailable || !onRoll || !['pending', 'error'].includes(roll.phase)}>
      <DiceRoller isRolling={rolling && !reducedMotion} displayValue={number} rollNonce={roll.startedAt ?? 0} duration={roll.duration ?? DICE_ROLL_DURATION_MS} />
      <span className="cosmic-roll-caption" aria-hidden="true">{label}{roll.phase === 'submitted' && <span>✓</span>}</span>
    </button>
    <p className="cosmic-roll-math">{settled ? <>{roll.value} {signedModifier}{modifier !== null && <> = <strong>{roll.value! + modifier}</strong></>}</> : `D20 ${signedModifier}`}</p>
    {roll.phase === 'error' && !unavailable && <p className="cosmic-roll-error" role="alert">Couldn’t send the result. Retrying keeps the same number.</p>}
    <span className="sr-only" role="status" aria-live="polite">{settled ? `Rolled ${roll.value}. ${modifier === null ? '' : `Total ${roll.value! + modifier}.`} ${label}` : label}</span>
  </section>;
}

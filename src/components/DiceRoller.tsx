import { Component, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePageVisible } from '../hooks/usePageVisible';
import { DIE_STYLES, getVisualDice, type DiceSides } from '../game/dice';
import DieFallback from './dice/DieFallback';
import { NUMBER_REVEAL_DELAY_MS, NUMBER_REVEAL_FADE_MS } from './dice/presentation';

const DiceScene = lazy(() => import('./dice/DiceScene'));

interface DiceRollerProps {
  isRolling: boolean;
  displayValue?: string;
  rollNonce: number;
  duration: number;
  sides?: DiceSides;
  disabled?: boolean;
  onRoll?: () => void;
  actionLabel?: string;
}

class DiceBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Load on first appearance, then pause offscreen without resetting the settled die. */
export default function DiceRoller({ isRolling, displayValue, rollNonce, duration, sides = 20, disabled = false, onRoll, actionLabel = `Roll d${sides}` }: DiceRollerProps) {
  const shell = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  const [hasAppeared, setHasAppeared] = useState(false);
  const visible = usePageVisible();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
      if (entry.isIntersecting) setHasAppeared(true);
    });
    if (shell.current) observer.observe(shell.current);
    return () => observer.disconnect();
  }, []);

  const dice = getVisualDice(sides, displayValue === undefined ? undefined : Number(displayValue));
  const enabled = Boolean(onRoll && !disabled && !isRolling);
  const fallback = <span className={dice.length > 1 ? 'cosmic-dice-fallback-pair' : 'cosmic-roll-die-fallback'}>
    {dice.map(die => <DieFallback key={die.id} die={die} enabled={enabled}
      label={`${actionLabel}${dice.length > 1 ? ` (${die.label})` : ''}`} onActivate={() => onRoll?.()} />)}
  </span>;

  return <span ref={shell} className={`cosmic-roll-die ${isRolling ? 'cosmic-roll-die--rolling' : ''} ${dice.length > 1 ? 'cosmic-roll-die--multiple' : ''}`}
    style={{ '--dice-roll-duration': `${duration}ms`, '--dice-light': DIE_STYLES[dice[0].kind].light,
      '--dice-number-delay': `${NUMBER_REVEAL_DELAY_MS}ms`, '--dice-number-fade': `${NUMBER_REVEAL_FADE_MS}ms` } as CSSProperties} role="group" aria-label={`d${sides} dice`}>
    {hasAppeared && !reducedMotion
      ? <DiceBoundary fallback={fallback}><Suspense fallback={fallback}>
        <DiceScene dice={dice} rollNonce={rollNonce} isRolling={isRolling} duration={duration} active={visible && inView} stageRef={shell}
          canActivate={enabled} onDieActivate={() => onRoll?.()} actionLabel={actionLabel} />
      </Suspense></DiceBoundary>
      : fallback}
  </span>;
}

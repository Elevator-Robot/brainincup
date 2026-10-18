import { Component, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePageVisible } from '../hooks/usePageVisible';

const TroubleDice3D = lazy(() => import('./TroubleDice3D'));

interface DiceRollerProps {
  isRolling: boolean;
  displayValue: string;
  rollNonce: number;
  duration: number;
}

class DiceBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Load on first appearance, then pause offscreen without resetting the settled die. */
export default function DiceRoller({ isRolling, displayValue, rollNonce, duration }: DiceRollerProps) {
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

  const fallback = <span className="cosmic-roll-die-fallback">
    <svg className="cosmic-roll-die-shape" viewBox="0 0 120 120" fill="none">
      <path className="cosmic-roll-die-face" d="m60 5 47 28v54l-47 28L13 87V33L60 5Z" />
      <path className="cosmic-roll-die-edges" d="m60 5 47 28v54l-47 28L13 87V33L60 5Zm0 0L32 42h56L60 5ZM13 33l19 9-9 40-10 5m94-54-19 9 9 40 10 5M23 82l37 33 37-33M32 42l-9 40m65-40 9 40" />
    </svg>
    <span className="cosmic-roll-die-number">{displayValue}</span>
  </span>;

  return <span ref={shell} className={`cosmic-roll-die ${isRolling ? 'cosmic-roll-die--rolling' : ''}`}
    style={{ '--dice-roll-duration': `${duration}ms` } as CSSProperties} aria-hidden="true">
    {hasAppeared && !reducedMotion
      ? <DiceBoundary fallback={fallback}><Suspense fallback={fallback}>
        <TroubleDice3D rollNonce={rollNonce} isRolling={isRolling} displayValue={displayValue} duration={duration} active={visible && inView} stageRef={shell} />
      </Suspense></DiceBoundary>
      : fallback}
  </span>;
}

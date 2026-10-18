import { useCallback, useRef } from 'react';
import type { VisualDie } from '../../game/dice';
import DieGlyph from './DieGlyph';
import { useDiePress } from './useDiePress';

/** Shape-only hit target for reduced motion, loading, or unavailable WebGL. */
export default function DieFallback({ die, enabled, label, onActivate }: { die: VisualDie; enabled: boolean; label: string; onActivate: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const feedback = useCallback((pressed: boolean) => { if (button.current) button.current.dataset.pressed = String(pressed); }, []);
  const press = useDiePress(enabled, onActivate, feedback);
  return <button ref={button} type="button" className="cosmic-dice-fallback-item cosmic-die-fallback-target" disabled={!enabled} aria-label={label}
    onPointerDown={press.down} onPointerMove={press.move} onPointerUp={press.up} onPointerLeave={press.cancel} onPointerCancel={press.cancel}
    onClick={event => { if (event.detail === 0) press.keyboard(); }}>
    <DieGlyph kind={die.kind} />
    {die.value !== undefined && <span className="cosmic-roll-die-number" aria-hidden="true">{die.value}</span>}
  </button>;
}

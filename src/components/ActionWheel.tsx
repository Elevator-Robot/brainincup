import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ChatAction, ChatActionIcon } from '../utils/chatActions';

interface ActionWheelProps {
  x: number;
  y: number;
  actions: ChatAction[];
  onSelect: (action: ChatAction) => void;
  onClose: () => void;
}

const RADIUS = 104;
const DEADZONE = 30;
const BOX = 300;
const EDGE = BOX / 2 + 8;

function WheelIcon({ name }: { name: ChatActionIcon }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'eye': return <svg {...common}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'speech': return <svg {...common}><path d="M20 12a7.5 7.5 0 0 1-10.6 6.8L4.5 20l1.2-4.6A7.5 7.5 0 1 1 20 12Z" /></svg>;
    case 'search': return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m20 20-3.6-3.6" /></svg>;
    case 'bag': return <svg {...common}><path d="M5 8h14l-1 11H6L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>;
    case 'scroll': return <svg {...common}><path d="M6 4h10a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2V4Z" /><path d="M9.5 9h5M9.5 13h5" /></svg>;
    case 'die': return <svg {...common}><rect x="4.5" y="4.5" width="15" height="15" rx="3.5" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>;
    case 'spark': return <svg {...common}><path d="M12 3.5 13.7 9l5.3 1.7-5.3 1.7L12 17.7 10.3 12.4 5 10.7 10.3 9 12 3.5Z" /><path d="M18.5 4.5 19 6l1.5.5L19 7l-.5 1.5L18 7l-1.5-.5L18 6l.5-1.5Z" /></svg>;
    case 'list': return <svg {...common}><path d="M8 7h11M8 12h11M8 17h7" /><circle cx="4.5" cy="7" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="17" r="1" fill="currentColor" /></svg>;
    case 'map': return <svg {...common}><path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" /><path d="M9 4v14M15 6v14" /></svg>;
    case 'bulb': return <svg {...common}><path d="M9.5 17h5M10 20h4" /><path d="M12 4a5.5 5.5 0 0 0-3 10.1V17h6v-2.9A5.5 5.5 0 0 0 12 4Z" /></svg>;
    case 'pen': return <svg {...common}><path d="M5 19l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L9 18l-4 1Z" /></svg>;
    case 'quote': return <svg {...common}><path d="M9 7c-2.5 1-4 3.2-4 6.2V17h5v-5H7c0-2 .8-3.4 2.6-4.2L9 7ZM18 7c-2.5 1-4 3.2-4 6.2V17h5v-5h-3c0-2 .8-3.4 2.6-4.2L18 7Z" /></svg>;
    default: return null;
  }
}

/** Hold-to-flick action wheel. Pointer picks a segment; keyboard works too. */
export default function ActionWheel({ x, y, actions, onSelect, onClose }: ActionWheelProps) {
  const [active, setActive] = useState(-1);
  const wheel = useRef<HTMLDivElement>(null);
  const committed = useRef(false);

  const commit = useCallback((index: number) => {
    if (committed.current || index < 0 || index >= actions.length) return;
    committed.current = true;
    onSelect(actions[index]);
  }, [actions, onSelect]);

  useEffect(() => { wheel.current?.focus({ preventScroll: true }); }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); setActive(current => (current + 1) % actions.length); return; }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); setActive(current => (current <= 0 ? actions.length - 1 : current - 1)); return; }
      if ((event.key === 'Enter' || event.key === 'Tab') && active >= 0) { event.preventDefault(); commit(active); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions.length, active, commit, onClose]);

  const track = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = wheel.current?.getBoundingClientRect();
    if (!box) return;
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    if (Math.hypot(dx, dy) < DEADZONE) { setActive(-1); return; }
    const step = (Math.PI * 2) / actions.length;
    const angle = Math.atan2(dy, dx) + Math.PI / 2;
    const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    setActive(Math.round(normalized / step) % actions.length);
  };

  const clamp = (value: number, axis: 'x' | 'y') => {
    const max = (axis === 'x' ? window.innerWidth : window.innerHeight) - EDGE;
    return Math.min(Math.max(value, EDGE), Math.max(EDGE, max));
  };

  const wheelStyle: CSSProperties = { left: clamp(x, 'x'), top: clamp(y, 'y'), width: BOX, height: BOX };
  const current = active >= 0 ? actions[active] : null;

  return createPortal(
    <div
      className="cosmic-wheel-layer"
      role="presentation"
      style={{ '--wheel-x': `${x}px`, '--wheel-y': `${y}px` } as CSSProperties}
      onPointerMove={track}
      onPointerUp={event => {
        if ((event.target as HTMLElement).closest('.cosmic-wheel-item')) return;
        if (active >= 0) commit(active);
        else onClose();
      }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={wheel}
        className="cosmic-wheel"
        role="dialog"
        aria-label="Adventure actions"
        tabIndex={-1}
        style={wheelStyle}
        onPointerDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
      >
        <div className="cosmic-wheel-ring" aria-hidden="true" />
        <div className={`cosmic-wheel-core${current ? ' is-armed' : ''}`} aria-live="polite">
          <strong>{current ? current.label : 'Actions'}</strong>
          <small>{current ? 'release to stage' : 'flick to choose'}</small>
        </div>
        {actions.map((action, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / actions.length;
          const style: CSSProperties = {
            left: `calc(50% + ${Math.round(Math.cos(angle) * RADIUS)}px)`,
            top: `calc(50% + ${Math.round(Math.sin(angle) * RADIUS)}px)`,
            animationDelay: `${index * 18}ms`,
          };
          return (
            <button
              key={action.id}
              type="button"
              tabIndex={-1}
              aria-label={action.label}
              className={`cosmic-wheel-item${active === index ? ' is-active' : ''}`}
              style={style}
              onMouseEnter={() => setActive(index)}
              onClick={() => commit(index)}
            >
              <WheelIcon name={action.icon} />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

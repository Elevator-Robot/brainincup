import { useCallback, useEffect, useId, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { BRAIN_ARTWORK } from '../utils/brainHandoff';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePageVisible } from '../hooks/usePageVisible';
import LivingBrain from './LivingBrain';
import { useBrainPhysics } from '../hooks/useBrainPhysics';

export type BrainPresenceMood = 'idle' | 'listening' | 'thinking' | 'speaking';
interface BrainPresenceProps {
  mood?: BrainPresenceMood; intensity?: number;
  pokeable?: boolean;
}

const STATUS: Record<BrainPresenceMood, string> = { idle: 'Resting', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' };

/** A living portrait with an optional playful poke, independent of audio. */
export default function BrainPresence({ mood = 'idle', intensity = 35, pokeable = false }: BrainPresenceProps) {
  const presenceRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLSpanElement>(null);
  const contactRef = useRef<HTMLSpanElement>(null);
  const hintId = useId();
  const pokePoint = useRef({ x: .5, y: .5 });
  const activity = mood === 'speaking' ? 1 : mood === 'thinking' ? .45 : .05;
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const visible = usePageVisible();
  const pointerFrame = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const energy = Number.isFinite(intensity) ? Math.max(0, Math.min(100, intensity)) / 100 : .35;
  const glowId = `brain-synapse-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const impulse = useBrainPhysics(bodyRef, contactRef, pokeable && !reducedMotion && visible);

  const locatePoke = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(.12, Math.min(.88, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(.12, Math.min(.88, (event.clientY - bounds.top) / bounds.height));
    pokePoint.current = { x, y };
    event.currentTarget.style.setProperty('--poke-x', `${x * 100}%`);
    event.currentTarget.style.setProperty('--poke-y', `${y * 100}%`);
  };

  const pokeBrain = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (reducedMotion || !visible || presenceRef.current?.querySelector('[data-brain-arriving]')) return;
    const { x, y } = event.detail === 0 ? { x: .5, y: .5 } : pokePoint.current;
    event.currentTarget.style.setProperty('--poke-x', `${x * 100}%`);
    event.currentTarget.style.setProperty('--poke-y', `${y * 100}%`);
    impulse(x, y);
  };

  const clearGaze = useCallback(() => {
    cancelAnimationFrame(pointerFrame.current);
    pointerFrame.current = 0;
    for (const property of ['--brain-gaze-x', '--brain-gaze-y', '--brain-gaze-rx', '--brain-gaze-ry']) {
      presenceRef.current?.style.removeProperty(property);
    }
  }, []);

  useEffect(() => {
    if (reducedMotion || !finePointer || !visible) clearGaze();
    return clearGaze;
  }, [reducedMotion, finePointer, visible, clearGaze]);

  const followCursor = (event: ReactPointerEvent<HTMLElement>) => {
    if (reducedMotion || !finePointer || !visible || event.pointerType !== 'mouse' || event.buttons) return;
    pointer.current = { x: event.clientX, y: event.clientY };
    if (pointerFrame.current) return;
    pointerFrame.current = requestAnimationFrame(() => {
      pointerFrame.current = 0;
      const presence = presenceRef.current;
      if (!presence || presence.querySelector('[data-brain-arriving]')) { clearGaze(); return; }
      const bounds = presence.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = Math.max(-1, Math.min(1, (pointer.current.x - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (pointer.current.y - bounds.top) / bounds.height * 2 - 1));
      presence.style.setProperty('--brain-gaze-x', `${(x * 4).toFixed(2)}px`);
      presence.style.setProperty('--brain-gaze-y', `${(y * 3).toFixed(2)}px`);
      presence.style.setProperty('--brain-gaze-rx', `${(-y * 2).toFixed(2)}deg`);
      presence.style.setProperty('--brain-gaze-ry', `${(x * 3).toFixed(2)}deg`);
    });
  };

  useEffect(() => {
    const presence = presenceRef.current;
    if (!presence || !visible || reducedMotion || typeof presence.getAnimations !== 'function') return;
    // Changing CSS animation-duration jumps the existing animation to a new
    // phase. Ease playback rates instead, preserving each spark's position.
    const animations = presence.getAnimations({ subtree: true }).flatMap(animation => {
      const name = 'animationName' in animation ? animation.animationName : '';
      if (name !== 'cosmic-brain-signal' && name !== 'cosmic-brain-current') return [];
      if (typeof animation.updatePlaybackRate !== 'function') return [];
      const rate = name === 'cosmic-brain-signal'
        ? (mood === 'speaking' ? 4.6 / 1.7 : mood === 'thinking' ? 4.6 / 3 : 1)
        : (mood === 'speaking' ? 5.2 / 2.4 : mood === 'thinking' ? 5.2 / 3.8 : 1);
      return [{ animation, rate, current: animation.playbackRate }];
    });
    if (!animations.length) return;
    let frame = 0;
    let previous = performance.now();
    const settle = (now: number) => {
      const delta = Math.max(0, Math.min(100, now - previous));
      previous = now;
      let moving = false;
      animations.forEach(item => {
        const ease = 1 - Math.exp(-delta / (item.rate < item.current ? 800 : 350));
        item.current += (item.rate - item.current) * ease;
        if (Math.abs(item.rate - item.current) < .004) item.current = item.rate;
        else moving = true;
        item.animation.updatePlaybackRate(item.current);
      });
      if (moving) frame = requestAnimationFrame(settle);
    };
    frame = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(frame);
  }, [mood, visible, reducedMotion]);

  const artwork = <>
    <span className="cosmic-brain-aura" aria-hidden="true" />
    <span ref={bodyRef} className="cosmic-brain-body">
      <span className="cosmic-brain-float">
        <span className="cosmic-brain-portrait">
          <img className="cosmic-brain-image" data-brain-destination src={BRAIN_ARTWORK} width="1672" height="941" alt="" draggable="false" />
          {visible && !reducedMotion && <LivingBrain activity={activity} energy={energy} />}
          <span className="cosmic-brain-neural-flow" aria-hidden="true"><i /><i /><i /></span>
          {/* Short light packets follow the artwork's folds, not a drawn network.
              This layer remains visible even without WebGL. */}
          <svg className="cosmic-brain-synapses" viewBox="0 0 1672 941" aria-hidden="true" focusable="false">
            <defs>
              <filter id={glowId} x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur stdDeviation="5" result="glow" />
                <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <g filter={`url(#${glowId})`}>
              <path pathLength="1" d="M614 462 Q660 370 742 353 T835 418 Q880 472 1000 498" />
              <path pathLength="1" d="M987 274 C1012 345 1090 411 987 492 S925 610 897 675" />
              <path pathLength="1" d="M555 379 C629 323 624 255 732 251 S888 211 912 283" />
              <path pathLength="1" d="M572 488 C653 557 717 530 802 563 S943 574 1059 602" />
              <path pathLength="1" d="M909 725 C894 663 976 662 1031 693" />
            </g>
          </svg>
        </span>
      </span>
    </span>
    {pokeable && <span ref={contactRef} className="cosmic-brain-contact" aria-hidden="true" />}
  </>;
  const pokeHint = 'Give Brain a gentle poke. Voice controls are in the menu rail.';
  return <section ref={presenceRef} className="cosmic-brain-presence" data-mood={mood}
    onPointerMove={followCursor} onPointerLeave={clearGaze} onPointerCancel={clearGaze}
    data-paused={!visible} data-reduced-motion={reducedMotion} style={{ '--brain-energy': energy } as CSSProperties} aria-label="Brain presence">
    {pokeable ? <>
      <button type="button" className="cosmic-brain-stage cosmic-brain-poke" onPointerDown={locatePoke} onClick={pokeBrain}
        aria-label="Poke Brain" aria-describedby={hintId} title="Give Brain a gentle poke">
        {artwork}
      </button>
      <span id={hintId} className="sr-only">{pokeHint}</span>
    </> : <div className="cosmic-brain-stage" role="img" aria-label={`Brain, ${STATUS[mood].toLowerCase()}`}>{artwork}</div>}
  </section>;
}

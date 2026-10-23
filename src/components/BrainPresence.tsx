import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { BRAIN_ARTWORK } from '../utils/brainHandoff';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePageVisible } from '../hooks/usePageVisible';
import LivingBrain from './LivingBrain';

export type BrainPresenceMood = 'idle' | 'listening' | 'thinking' | 'speaking';
interface BrainPresenceProps { mood?: BrainPresenceMood; intensity?: number }

const STATUS: Record<BrainPresenceMood, string> = { idle: 'Resting', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' };

/** A passive living portrait. Only conversation activity changes his behavior. */
export default function BrainPresence({ mood = 'idle', intensity = 35 }: BrainPresenceProps) {
  const presenceRef = useRef<HTMLElement>(null);
  const activity = mood === 'speaking' ? 1 : mood === 'thinking' ? .45 : .05;
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const visible = usePageVisible();
  const energy = Number.isFinite(intensity) ? Math.max(0, Math.min(100, intensity)) / 100 : .35;
  const glowId = `brain-synapse-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

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

  return <section ref={presenceRef} className="cosmic-brain-presence" data-mood={mood}
    data-paused={!visible} data-reduced-motion={reducedMotion} style={{ '--brain-energy': energy } as CSSProperties} aria-label="Brain presence">
    <div className="cosmic-brain-stage" role="img" aria-label={`Brain, ${STATUS[mood].toLowerCase()}`}>
      <span className="cosmic-brain-aura" aria-hidden="true" />
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
    </div>
  </section>;
}

import { usePageVisible } from '../hooks/usePageVisible';
import { useRef, type CSSProperties } from 'react';
import { useAmbientPointer } from '../hooks/useAmbientPointer';
import { useMediaQuery } from '../hooks/useMediaQuery';
import NebulaBackdrop from './NebulaBackdrop';

// Fixed, irregular positions keep hydration stable. Sparse dust, not a grid.
const DUST = [[7, 19], [23, 72], [37, 13], [81, 29], [66, 83], [91, 68], [12, 89], [48, 43], [74, 9], [32, 91], [95, 15], [58, 65]];

/** Resolution-independent living mist, with the shared vector as a safe fallback. */
export default function SiteBackground() {
  const visible = usePageVisible();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const surface = useRef<HTMLDivElement>(null);
  useAmbientPointer(surface);
  return (
    <div ref={surface} className="site-background" data-paused={!visible || undefined} aria-hidden="true">
      <div className="site-background-depth">
        <img className="site-background-nebula" src="/images/workspace-nebula.svg" width="1800" height="1200" decoding="async" alt="" />
      </div>
      <NebulaBackdrop paused={!visible} reducedMotion={reducedMotion} />
      <div className="site-background-bloom" />
      <div className="site-background-dust">
        {DUST.map(([x, y], index) => <i key={index} style={{ left: `${x}%`, top: `${y}%`, '--dust-delay': `${-index * 1.7}s`, '--dust-size': `${index % 3 === 0 ? 2 : 1}px` } as CSSProperties} />)}
      </div>
    </div>
  );
}

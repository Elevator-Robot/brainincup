import { useEffect, useRef, useState } from 'react';
import { AuthModal } from '../components/CustomAuth';
import SiteBackground from '../components/SiteBackground';
import WorkspaceShell from '../WorkspaceShell';
import { beginBrainHandoff, cancelBrainHandoff } from '../utils/brainHandoff';

/** Explicit, local-only visual replay. This button never authenticates a real user. */
export default function BrainArrivalPreview() {
  const [phase, setPhase] = useState<'login' | 'departing' | 'workspace'>('login');
  const timer = useRef<number>();
  useEffect(() => () => { window.clearTimeout(timer.current); cancelBrainHandoff(); }, []);
  const enter = () => {
    const animated = beginBrainHandoff();
    setPhase(animated ? 'departing' : 'workspace');
    if (animated) timer.current = window.setTimeout(() => setPhase('workspace'), 300);
  };
  return <>
    <SiteBackground />
    {phase !== 'login' && <WorkspaceShell />}
    {phase !== 'workspace' && <div className={phase === 'departing' ? 'cosmic-auth-departing' : undefined} aria-hidden={phase === 'departing' || undefined}>
      <AuthModal>
        <header className="bic-auth-intro"><h2 className="bic-auth-wordmark"><span>Brain</span> in Cup</h2></header>
        <div className="cosmic-brain-demo-entry">
          <p>The same Brain. A new place to call home.</p>
          <button type="button" onClick={enter}>Enter Brain chat <span aria-hidden="true">↗</span></button>
          <small>Local animation preview · no sign-in or cloud calls</small>
        </div>
      </AuthModal>
    </div>}
    {phase === 'workspace' && <button type="button" className="cosmic-brain-demo-replay" onClick={() => {
      cancelBrainHandoff();
      setPhase('login');
    }}>↶ Replay arrival <span>· local demo</span></button>}
  </>;
}

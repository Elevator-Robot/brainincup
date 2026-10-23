import { useEffect, useRef, useState } from 'react';
import { AuthModal } from '../components/CustomAuth';
import SiteBackground from '../components/SiteBackground';
import WorkspaceShell from '../WorkspaceShell';
import { beginBrainHandoff, cancelBrainHandoff } from '../utils/brainHandoff';
import { router } from '../router';

/** Explicit, local-only visual replay. This button never authenticates a real user. */
export default function BrainArrivalPreview() {
  const [phase, setPhase] = useState<'login' | 'departing' | 'workspace'>('login');
  const [workspaceStarted, setWorkspaceStarted] = useState(false);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState('');
  const enteringRef = useRef(false);
  const timer = useRef<number>();
  useEffect(() => () => { window.clearTimeout(timer.current); cancelBrainHandoff(); }, []);
  const enter = async () => {
    if (enteringRef.current) return;
    enteringRef.current = true;
    setEntering(true);
    setError('');
    try {
      // Replaying login from a GM route must follow the same Brain-first policy
      // as real sign-in, before the workspace is allowed to mount.
      await router.navigate({ to: '/brain/$conversationId', params: { conversationId: 'new' }, search: true, replace: true });
      setWorkspaceStarted(true);
      const animated = beginBrainHandoff();
      setPhase(animated ? 'departing' : 'workspace');
      if (animated) timer.current = window.setTimeout(() => setPhase('workspace'), 300);
    } catch { setError('Unable to open Brain. Please try again.'); }
    finally { enteringRef.current = false; setEntering(false); }
  };
  return <>
    <SiteBackground />
    {/* Keep the router's transition coordinator alive during a visual replay.
        The old workspace is hidden, never presented as the login destination. */}
    {workspaceStarted && <div aria-hidden={phase === 'login' || undefined} style={{ visibility: phase === 'login' ? 'hidden' : undefined }}>
      <WorkspaceShell />
    </div>}
    {phase !== 'workspace' && <div className={phase === 'departing' ? 'cosmic-auth-departing' : undefined} aria-hidden={phase === 'departing' || undefined}>
      <AuthModal>
        <header className="bic-auth-intro"><h2 className="bic-auth-wordmark"><span>Brain</span> in Cup</h2></header>
        <div className="cosmic-brain-demo-entry">
          <p>The same Brain. A new place to call home.</p>
          <button type="button" disabled={entering} onClick={() => { void enter(); }}>{entering ? 'Opening Brain…' : 'Enter Brain chat'} <span aria-hidden="true">↗</span></button>
          {error && <p role="alert">{error}</p>}
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

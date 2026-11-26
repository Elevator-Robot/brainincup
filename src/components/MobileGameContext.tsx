import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ContextPanel } from '../hooks/useContextPanel';

interface MobileGameContextProps {
  characterName: string;
  avatarSrc?: string;
  avatarSrcWebp?: string;
  questTitle?: string;
  renderContext: (initialPanel: ContextPanel) => ReactNode;
}

/** The same context as desktop, in an on-demand, independently scrolling sheet. */
export default function MobileGameContext({
  characterName, avatarSrc, avatarSrcWebp, questTitle, renderContext,
}: MobileGameContextProps) {
  const [panel, setPanel] = useState<ContextPanel | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    if (!panel) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [panel]);

  const chevron = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>;

  return <section className="cosmic-mobile-context" aria-label="Adventure context">
    <div className="cosmic-mobile-context-triggers">
      <button type="button" onClick={() => setPanel('quests')} aria-haspopup="dialog" aria-controls={id} aria-expanded={panel === 'quests'}>
        <span><small>Quest log</small><strong>{questTitle || 'No active quest'}</strong></span>
        {chevron}
      </button>
      <button type="button" onClick={() => setPanel('character')} aria-haspopup="dialog" aria-controls={id} aria-expanded={panel === 'character'}>
        {avatarSrc && <picture>
          {avatarSrcWebp && <source srcSet={avatarSrcWebp} type="image/webp" />}
          <img src={avatarSrc} alt="" width="32" height="36" />
        </picture>}
        <span><small>Character</small><strong>{characterName}</strong></span>
        {chevron}
      </button>
    </div>
    {panel && <dialog ref={dialogRef} id={id} className="cosmic-context-sheet" aria-labelledby={`${id}-title`}
      onCancel={event => { event.preventDefault(); setPanel(null); }}
      onClick={event => { if (event.target === event.currentTarget) setPanel(null); }}>
      <div className="cosmic-context-sheet-content">
        <header>
          <h2 id={`${id}-title`}>Adventure context</h2>
          <button type="button" onClick={() => setPanel(null)} aria-label="Close adventure context">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" strokeLinecap="round" /></svg>
          </button>
        </header>
        {renderContext(panel)}
      </div>
    </dialog>}
  </section>;
}

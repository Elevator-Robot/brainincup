import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ContextPanel } from '../hooks/useContextPanel';
import { useDialogPresence } from '../hooks/useDialogPresence';

interface MobileGameContextProps {
  characterName: string;
  avatarSrc?: string;
  avatarSrcWebp?: string;
  questTitle?: string;
  inventoryNotice?: string;
  questNotice?: string;
  renderContext: (initialPanel: ContextPanel) => ReactNode;
}

/** The same context as desktop, in an on-demand, independently scrolling sheet. */
export default function MobileGameContext({
  characterName, avatarSrc, avatarSrcWebp, questTitle, inventoryNotice, questNotice, renderContext,
}: MobileGameContextProps) {
  const [panel, setPanel] = useState<ContextPanel>('character');
  const [opening, setOpening] = useState(0);
  const [open, setOpen] = useState(false);
  const present = useDialogPresence(open);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  const showPanel = (next: ContextPanel) => { setPanel(next); setOpening(value => value + 1); setOpen(true); };

  const chevron = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>;

  return <section className="cosmic-mobile-context" aria-label="Adventure context">
    <div className="cosmic-mobile-context-triggers">
      <button type="button" onClick={() => showPanel('quests')} aria-haspopup="dialog" aria-controls={id}
        aria-expanded={open && panel === 'quests'} data-updated={Boolean(questNotice)} aria-describedby={questNotice ? `${id}-quest-update` : undefined}>
        <span><small>Quest log</small><strong>{questTitle || 'No active quest'}</strong></span>
        {chevron}
      </button>
      <button type="button" onClick={() => showPanel('character')} aria-haspopup="dialog" aria-controls={id}
        aria-expanded={open && panel === 'character'} data-updated={Boolean(inventoryNotice)} aria-describedby={inventoryNotice ? `${id}-inventory-update` : undefined}>
        {avatarSrc && <picture>
          {avatarSrcWebp && <source srcSet={avatarSrcWebp} type="image/webp" />}
          <img src={avatarSrc} alt="" width="32" height="36" />
        </picture>}
        <span><small>Character</small><strong>{characterName}</strong></span>
        {chevron}
      </button>
    </div>
    <span id={`${id}-quest-update`} className="sr-only">{questNotice}</span>
    <span id={`${id}-inventory-update`} className="sr-only">{inventoryNotice}</span>
    {present && <dialog ref={dialogRef} id={id} className="cosmic-context-sheet" aria-labelledby={`${id}-title`}
      onCancel={event => { event.preventDefault(); setOpen(false); }}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="cosmic-context-sheet-content">
        <header>
          <h2 id={`${id}-title`}>Adventure context</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close adventure context">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" strokeLinecap="round" /></svg>
          </button>
        </header>
        <Fragment key={opening}>{renderContext(panel)}</Fragment>
      </div>
    </dialog>}
  </section>;
}

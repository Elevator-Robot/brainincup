import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';

export interface ChatComposerHandle {
  clear: () => void;
  append: (text: string) => void;
  focus: () => void;
}

interface ChatComposerProps {
  draft: MutableRefObject<string>;
  onSend: (content: string) => Promise<boolean>;
  isLocked: boolean;
  isWaiting: boolean;
  isPrimed: boolean;
  placeholder: string;
  isGameMasterMode?: boolean;
}

const GM_ACTIONS = [
  { label: 'Look around', prompt: 'I look around carefully. What catches my attention?' },
  { label: 'Talk', prompt: 'I approach someone nearby and start a conversation.' },
  { label: 'Inventory', prompt: 'I check my inventory.' },
  { label: 'Quests', prompt: 'I review my active quests.' },
];

/** Keep keystrokes local so typing never rerenders the conversation or context. */
const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer({
  draft, onSend, isLocked, isWaiting, isPrimed, placeholder, isGameMasterMode = false,
}, ref) {
  const [value, setValue] = useState(draft.current);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const update = (next: string) => {
    draft.current = next;
    setValue(next);
  };
  useImperativeHandle(ref, () => ({
    clear: () => update(''),
    append: (text) => update(`${draft.current}${draft.current && !draft.current.endsWith(' ') ? ' ' : ''}${text}`),
    focus: () => textarea.current?.focus(),
  }));

  useLayoutEffect(() => {
    const input = textarea.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
  }, [value]);

  const submit = async () => {
    if (!value.trim() || isLocked || submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    setError('');
    try {
      if (await onSend(value.trim())) update('');
    } catch {
      setError('Couldn’t send that yet. Your draft is saved—please try again.');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={event => { event.preventDefault(); void submit(); }} className="cosmic-composer">
      <div className={`retro-input-shell flex items-end gap-2 rounded-lg border p-2 ${isPrimed ? 'retro-input-shell-primed' : ''}`}>
        <textarea ref={textarea} value={value} onChange={event => update(event.target.value)}
          aria-label={isGameMasterMode ? 'Your next action' : 'Message Brain'} placeholder={placeholder} rows={1} readOnly={isSubmitting}
          className="retro-input-textarea min-w-0 flex-1 resize-none border-0 bg-transparent px-3 py-2.5 leading-relaxed focus:outline-none"
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault();
              void submit();
            }
          }} />
        <button type="submit" aria-label="Send message" disabled={!value.trim() || isLocked || isSubmitting}
          className={`retro-send-button flex h-11 w-11 shrink-0 items-center justify-center rounded ${!value.trim() || isLocked || isSubmitting ? 'retro-send-button-disabled' : 'retro-send-button-active-brain'}`}>
          {isWaiting || isSubmitting
            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
            : <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m5 12 7-7 7 7M12 5v14" /></svg>}
        </button>
      </div>
      {isGameMasterMode && <div className="gm-quick-actions" role="group" aria-label="Adventure actions">
        {GM_ACTIONS.map(action => <button key={action.label} type="button" disabled={isLocked || isSubmitting}
          onClick={() => { update(`${draft.current}${draft.current.trim() ? '\n' : ''}${action.prompt}`); textarea.current?.focus(); }}>
          {action.label}
        </button>)}
      </div>}
      {error && <p className="mt-2 text-xs text-brand-status-error" role="alert">{error}</p>}
      <p className="cosmic-composer-hint"><span><kbd>Enter</kbd> to send · <kbd>Shift + Enter</kbd> for a new line</span></p>
    </form>
  );
});

export default ChatComposer;

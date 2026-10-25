import { forwardRef, useImperativeHandle, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react';
import ActionWheel from './ActionWheel';
import { useComposerSize } from '../hooks/useComposerSize';
import { appendPrompt, filterActions, type ChatAction } from '../utils/chatActions';
import type { ChatComposerConfiguration } from '../chat/presentation';

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
  configuration: ChatComposerConfiguration;
}

const SLASH_PATTERN = /^\/([a-z-]*)$/i;

/** Keep keystrokes local so typing never rerenders the conversation or context. */
const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer({
  draft, onSend, isLocked, isWaiting, isPrimed, placeholder, configuration,
}, ref) {
  const [value, setValue] = useState(draft.current);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [caretAtEnd, setCaretAtEnd] = useState(true);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [wheel, setWheel] = useState<{ x: number; y: number } | null>(null);
  const submitting = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const { actions, quickActions, suggestCompletion, inputLabel } = configuration;

  const slashQuery = SLASH_PATTERN.exec(value)?.[1] ?? null;
  const slashMatches = slashQuery === null ? [] : filterActions(actions, slashQuery);
  const slashOpen = !isLocked && slashQuery !== null && !slashDismissed && slashMatches.length > 0;
  const activeSlash = Math.min(slashIndex, Math.max(slashMatches.length - 1, 0));

  const ghost = caretAtEnd && !isLocked ? suggestCompletion(value) : '';
  const showGhost = Boolean(ghost) && !slashOpen;
  const sizing = useComposerSize(`${value}${showGhost ? ghost : ''}`, textarea);

  const update = (next: string) => {
    draft.current = next;
    setValue(next);
    setSlashDismissed(false);
    setSlashIndex(0);
    setCaretAtEnd(true);
  };
  useImperativeHandle(ref, () => ({
    clear: () => update(''),
    append: (text) => update(`${draft.current}${draft.current && !draft.current.endsWith(' ') ? ' ' : ''}${text}`),
    focus: () => textarea.current?.focus(),
  }));

  const stageAction = (action: ChatAction, existingDraft: boolean) => {
    update(existingDraft ? appendPrompt(draft.current, action.prompt) : action.prompt);
    textarea.current?.focus();
  };

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

  const openWheel = (event: ReactMouseEvent) => {
    if (isLocked || actions.length === 0) return;
    event.preventDefault();
    setWheel({ x: event.clientX, y: event.clientY });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (slashOpen) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setSlashIndex(index => (index + 1) % slashMatches.length); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSlashIndex(index => (index <= 0 ? slashMatches.length - 1 : index - 1)); return; }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); stageAction(slashMatches[activeSlash], false); return; }
      if (event.key === 'Escape') { event.preventDefault(); setSlashDismissed(true); return; }
    }
    if (event.key === 'Tab' && showGhost) { event.preventDefault(); update(`${value}${ghost}`); return; }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form ref={sizing.form} onSubmit={event => { event.preventDefault(); void submit(); }} className="cosmic-composer cosmic-chat-surface"
      data-composer-state={isWaiting ? 'thinking' : isSubmitting ? 'sending' : value.trim() ? 'ready' : 'idle'}>
      <div ref={sizing.shell} className={`retro-input-shell flex items-end gap-2 rounded-lg border p-2 ${isPrimed ? 'retro-input-shell-primed' : ''}`}
        onContextMenu={openWheel} data-composer-shell>
        <div className="cosmic-composer-field">
          <div className="cosmic-ghost" aria-hidden="true" data-ui-placeholder
            ref={node => { if (node) node.inert = true; }}>
            <span>{value}</span>{showGhost ? <span className="cosmic-ghost-tail">{ghost}</span> : null}
          </div>
          <textarea ref={textarea} value={value}
            onChange={event => {
              update(event.target.value);
              setCaretAtEnd(event.target.selectionStart === event.target.value.length);
            }}
            onSelect={event => setCaretAtEnd(event.currentTarget.selectionStart === value.length && event.currentTarget.selectionEnd === value.length)}
            onKeyDown={onKeyDown}
            aria-label={inputLabel} placeholder={placeholder} rows={1} readOnly={isSubmitting}
            className="retro-input-textarea min-w-0 flex-1 resize-none border-0 bg-transparent px-3 py-2.5 leading-relaxed focus:outline-none" />
        </div>
        <button type="submit" aria-label="Send message" disabled={!value.trim() || isLocked || isSubmitting}
          className={`retro-send-button flex h-11 w-11 shrink-0 items-center justify-center rounded ${!value.trim() || isLocked || isSubmitting ? 'retro-send-button-disabled' : 'retro-send-button-active-brain'}`}>
          {isWaiting || isSubmitting
            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
            : <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m5 12 7-7 7 7M12 5v14" /></svg>}
        </button>
        {slashOpen && (
          <div className="cosmic-slash-menu" role="listbox" aria-label="Actions">
            {slashMatches.map((action, index) => (
              <button key={action.id} type="button" role="option" aria-selected={index === activeSlash}
                className={`cosmic-slash-item${index === activeSlash ? ' is-active' : ''}`}
                onMouseEnter={() => setSlashIndex(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => stageAction(action, false)}>
                <span className="cosmic-slash-command">/{action.command}</span>
                <span className="cosmic-slash-label">{action.label}</span>
                <span className="cosmic-slash-hint">{action.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {quickActions.length > 0 && <div className="cosmic-quick-actions" role="group" aria-label="Chat suggestions">
        {quickActions.map(action => <button key={action.id} type="button" disabled={isLocked || isSubmitting}
          onClick={() => stageAction(action, true)}>
          {action.label}
        </button>)}
      </div>}
      {error && <p className="mt-2 text-xs text-brand-status-error" role="alert">{error}</p>}
      <div className="cosmic-composer-meta">
        <p className="cosmic-composer-hint">
          {slashOpen
            ? <span><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> stage · <kbd>Esc</kbd> dismiss</span>
            : <span><kbd>Enter</kbd> to send · <kbd>Shift + Enter</kbd> for a new line{showGhost ? <> · <kbd>Tab</kbd> to accept</> : null}{actions.length > 0 ? <> · <kbd>/</kbd> for suggestions</> : null}</span>}
        </p>
      </div>
      {wheel && <ActionWheel x={wheel.x} y={wheel.y} actions={actions}
        onSelect={action => { setWheel(null); stageAction(action, true); }}
        onClose={() => { setWheel(null); textarea.current?.focus(); }} />}
    </form>
  );
});

export default ChatComposer;

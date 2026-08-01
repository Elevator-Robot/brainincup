import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

// When assistant content grows by more than this in a single commit, it was
// delivered all at once (Brain's final response arrives as one big delta after
// its multi-agent pipeline) and gets revealed progressively so it reads like
// streaming. Small increments (Game Master's real deltas) stream natively.
const AT_ONCE_JUMP = 120;

export interface ToolCallRecord {
  toolCallId: string;
  name: string;
  args: string;
  result?: string;
  status: 'running' | 'completed' | 'error';
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  isTyping?: boolean;
  fullContent?: string; // Store the complete content when typing
  // Additional AI response data
  sensations?: string[];
  thoughts?: string[];
  memories?: string;
  selfReflection?: string;
  // AG-UI streaming data
  messageId?: string;
  reasoning?: string;
  toolCalls?: ToolCallRecord[];
  activeStep?: string;
  streamError?: string;
  // Set when the stream created this message so the bubble can animate its
  // first appearance even when React batches all events into one commit.
  populateOnMount?: boolean;
}

interface MessageBubbleProps {
  message: Message;
  isGameMasterMode: boolean;
  variant: 'desktop' | 'mobile';
  expanded: boolean;
  onToggleExpanded: () => void;
  containerRef?: (el: HTMLDivElement | null) => void;
}

/**
 * Shared message bubble rendered by every chat (Brain, Game Master, and any
 * future experience) so the chat surface looks and feels the same everywhere.
 * `variant` only adjusts sizing for the desktop vs mobile layouts.
 */
export function MessageBubble({
  message,
  isGameMasterMode,
  variant,
  expanded,
  onToggleExpanded,
  containerRef,
}: MessageBubbleProps) {
  const isDesktop = variant === 'desktop';
  const { role } = message;

  // Fire the text-populate animation when content first becomes visible.
  // Brain emits its whole response in a single TEXT_MESSAGE_CONTENT followed
  // immediately by TEXT_MESSAGE_END + response_complete, which React 18 batches
  // into ONE commit — so the bubble can mount with full content and no
  // empty -> non-empty transition ever happens. `populateOnMount` (set by the
  // stream handler) covers that first mount; the transition effect below covers
  // experiences that stream real deltas (Game Master, legacy typing animation).
  const [populating, setPopulating] = useState(() => Boolean(message.populateOnMount && message.content));
  useEffect(() => {
    if (!populating) return;
    const t = setTimeout(() => setPopulating(false), 600);
    return () => clearTimeout(t);
  }, [populating]);

  // Reveal at-once responses progressively (typewriter) so Brain feels like it
  // streams the way Game Master does, instead of the whole text snapping in.
  // `revealLen` is how much of the content is currently visible. It normally
  // tracks content.length (native streaming from real deltas shows in full);
  // only a big single-commit jump drives it down while it types out.
  const [revealLen, setRevealLen] = useState(() =>
    message.populateOnMount && message.content ? 0 : message.content.length,
  );
  const revealLenRef = useRef(revealLen);
  const revealRafRef = useRef<number>(0);
  const revealingRef = useRef(false);
  const setRevealLenBoth = useCallback((len: number) => {
    revealLenRef.current = len;
    setRevealLen(len);
  }, []);

  const startReveal = useCallback((target: number) => {
    if (revealRafRef.current) cancelAnimationFrame(revealRafRef.current);
    const startLen = revealLenRef.current;
    if (target <= startLen) return;
    revealingRef.current = true;
    const startTime = performance.now();
    const duration = Math.min(2400, Math.max(300, (target - startLen) * 2));
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextLen = Math.round(startLen + (target - startLen) * eased);
      setRevealLenBoth(nextLen);
      if (progress < 1) {
        revealRafRef.current = requestAnimationFrame(tick);
      } else {
        revealRafRef.current = 0;
        revealingRef.current = false;
      }
    };
    revealRafRef.current = requestAnimationFrame(tick);
  }, [setRevealLenBoth]);

  const prevContentRef = useRef(message.content);
  useEffect(() => {
    const prev = prevContentRef.current;
    prevContentRef.current = message.content;
    if (role !== 'assistant') return;
    if (message.content && !prev) {
      // Empty -> non-empty: the pop-in fade.
      setPopulating(true);
    }
    if (!message.content) return;
    const grewAtOnce = message.content.length - prev.length > AT_ONCE_JUMP;
    // The stream can batch TEXT_MESSAGE_START..response_complete into one
    // commit (React 18), so the bubble may mount with full content already.
    const mountsFull = message.populateOnMount && prev.length === message.content.length;
    if (grewAtOnce || mountsFull) {
      startReveal(message.content.length);
    } else if (!revealingRef.current) {
      // Native streaming (Game Master deltas): keep everything visible.
      setRevealLenBoth(message.content.length);
    }
  }, [role, message.content, message.populateOnMount, setRevealLenBoth, startReveal]);

  useEffect(() => () => {
    if (revealRafRef.current) cancelAnimationFrame(revealRafRef.current);
  }, []);

  const visibleContent =
    revealLen < message.content.length ? message.content.slice(0, revealLen) : message.content;

  const markdownComponents = {
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="leading-relaxed break-words" style={{ margin: '0 0 2px 0' }}>{children}</p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="list-disc pl-5 space-y-0 mb-0.5 last:mb-0">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="list-decimal pl-5 space-y-0 mb-0.5 last:mb-0">{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-bold text-brand-accent-primary">{children}</strong>,
    em: ({ children }: { children?: React.ReactNode }) => <em className="italic text-brand-text-muted">{children}</em>,
    code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
      const isInline = !className;
      return isInline ? (
        <code className="px-1.5 py-0.5 rounded bg-brand-surface-elevated/50 text-purple-300 text-sm font-mono" {...props}>{children}</code>
      ) : (
        <code className="block p-3 rounded-lg bg-brand-surface-elevated/50 text-sm font-mono overflow-x-auto whitespace-pre-wrap my-0.5" {...props}>{children}</code>
      );
    },
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="border-l-2 border-brand-accent-primary/50 pl-4 italic text-brand-text-muted my-0.5">{children}</blockquote>
    ),
    h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-xl font-bold text-brand-accent-primary mb-0.5 mt-0.5">{children}</h1>,
    h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-lg font-bold text-brand-accent-primary mb-0.5">{children}</h2>,
    h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-base font-bold text-brand-text-primary mb-0.5">{children}</h3>,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a href={href} className="text-brand-accent-primary underline hover:text-brand-accent-secondary transition-colors" target="_blank" rel="noopener noreferrer">{children}</a>
    ),
    hr: () => <hr className="border-brand-surface-border/50 my-0.5" />,
  };

  const detailCardClass = `rounded-lg bg-brand-surface-elevated/30 border border-brand-surface-border/50 ${isDesktop ? 'p-3' : 'p-2.5'}`;
  const detailTitleClass = `font-medium flex items-center text-brand-text-primary ${isDesktop ? 'text-sm mb-2 gap-2' : 'text-xs mb-1.5 gap-1.5'}`;
  const detailIconClass = isDesktop ? 'w-4 h-4' : 'w-3.5 h-3.5';
  const detailTextClass = `text-brand-text-muted leading-relaxed ${isDesktop ? 'text-sm' : 'text-xs'}`;
  const detailListClass = `${isDesktop ? 'text-sm space-y-1.5 ml-6' : 'text-xs space-y-1 ml-5'} text-brand-text-muted`;

  return (
    <div className={`retro-message-row flex ${isDesktop ? 'gap-4' : 'gap-3'} ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        ref={containerRef}
        className={`flex flex-col gap-2 ${isDesktop ? 'max-w-[85%] sm:max-w-[75%]' : 'max-w-[85%]'}`}
      >
        <div
          className={`retro-message message-bubble rounded-2xl px-4 py-3 backdrop-blur-sm transition-all duration-300 hover:brightness-110 ${
            role === 'user'
              ? 'retro-message-user text-white'
              : 'retro-message-assistant text-brand-text-primary'
          } ${role === 'assistant' ? 'cursor-pointer' : ''} ${populating ? 'animate-text-populate' : ''}`}
          onClick={onToggleExpanded}
        >
          <div className={isDesktop ? 'break-words' : 'break-words text-sm'}>
            {isGameMasterMode && (
              <span className={`mb-1 block uppercase text-brand-text-muted ${
                isDesktop ? 'text-[11px] tracking-[0.22em]' : 'text-[10px] tracking-[0.2em]'
              } ${role === 'user' ? 'text-teal-200/75' : ''}`}>
                {role === 'user' ? 'You' : 'Brain'}
              </span>
            )}
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
              {visibleContent}
            </ReactMarkdown>
          </div>
        </div>

        {/* AG-UI tool call cards (Game Master) */}
        {role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-2">
            {message.toolCalls.map((toolCall) => (
              <div
                key={toolCall.toolCallId}
                className="rounded-xl border border-brand-surface-border/50 bg-brand-surface-elevated/40 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                    toolCall.status === 'running'
                      ? 'bg-amber-400 animate-pulse'
                      : toolCall.status === 'error'
                        ? 'bg-red-400'
                        : 'bg-green-400'
                  }`} />
                  <span className="text-xs font-semibold text-brand-accent-primary">{toolCall.name}</span>
                  {toolCall.status === 'running' && (
                    <span className="text-[10px] text-brand-text-muted">running…</span>
                  )}
                </div>
                {toolCall.args && (
                  <pre className="mt-1 text-[10px] font-mono text-brand-text-muted whitespace-pre-wrap break-words">
                    {toolCall.args}
                  </pre>
                )}
                {toolCall.result && toolCall.result !== 'undefined' && (
                  <pre className="mt-1 text-[10px] font-mono text-green-300/80 whitespace-pre-wrap break-words">
                    {toolCall.result}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Show additional details when expanded */}
        {role === 'assistant' && expanded && (
          <div className={`animate-slide-up ${isDesktop ? 'mt-4 space-y-3' : 'mt-3 space-y-2.5'}`}>
            {/* Reasoning (AG-UI REASONING_MESSAGE stream) */}
            {message.reasoning && message.reasoning.trim() && (
              <div className={detailCardClass}>
                <div className={`${detailTitleClass} text-amber-300`}>
                  <svg className={detailIconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Reasoning
                </div>
                <p className={`${detailTextClass} whitespace-pre-wrap`}>{message.reasoning}</p>
              </div>
            )}
            {/* Sensations */}
            {message.sensations && message.sensations.length > 0 && (
              <div className={detailCardClass}>
                <div className={`${detailTitleClass} text-purple-300`}>
                  <svg className={detailIconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Sensations
                </div>
                <ul className={detailListClass}>
                  {message.sensations.map((sensation, i) => (
                    <li key={i} className="leading-relaxed">• {sensation}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Thoughts */}
            {message.thoughts && message.thoughts.length > 0 && (
              <div className={detailCardClass}>
                <div className={`${detailTitleClass} text-blue-300`}>
                  <svg className={detailIconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Thoughts
                </div>
                <ul className={detailListClass}>
                  {message.thoughts.map((thought, i) => (
                    <li key={i} className="leading-relaxed">• {thought}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Memories */}
            {message.memories && message.memories.trim() && (
              <div className={detailCardClass}>
                <div className={`${detailTitleClass} text-green-300`}>
                  <svg className={detailIconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Memories
                </div>
                <p className={detailTextClass}>{message.memories}</p>
              </div>
            )}

            {/* Self Reflection */}
            {message.selfReflection && message.selfReflection.trim() && (
              <div className={detailCardClass}>
                <div className={`${detailTitleClass} text-violet-300`}>
                  <svg className={detailIconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Self Reflection
                </div>
                <p className={detailTextClass}>{message.selfReflection}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

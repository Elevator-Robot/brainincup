import { memo, useEffect, useId, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { ChatDiceRoll } from '../utils/diceRolls';
import { useTypewriterText } from '../hooks/useTypewriterText';

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
  diceRoll?: ChatDiceRoll;
}

interface MessageBubbleProps {
  message: Message;
  isGameMasterMode: boolean;
  variant: 'desktop' | 'mobile';
  expanded: boolean;
  onToggleExpanded: () => void;
  containerRef?: (el: HTMLDivElement | null) => void;
}

// Stable renderers preserve DOM nodes (and text selection) as streaming grows.
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
      <code className="px-1.5 py-0.5 rounded bg-brand-surface-elevated/50 text-brand-accent-primary text-sm font-mono" {...props}>{children}</code>
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
const remarkPlugins = [remarkGfm, remarkBreaks];
const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>{content}</ReactMarkdown>;
});

/** One shared, memoized chat bubble for desktop and mobile. */
export const MessageBubble = memo(function MessageBubble({
  message, isGameMasterMode, variant, expanded, onToggleExpanded, containerRef,
}: MessageBubbleProps) {
  const isDesktop = variant === 'desktop';
  const { role } = message;
  const visibleContent = useTypewriterText(
    message.content,
    role === 'assistant' && Boolean(message.populateOnMount || message.isTyping),
  );
  const [populating, setPopulating] = useState(() => Boolean(message.populateOnMount && message.content));
  const previousContent = useRef(message.content);
  useEffect(() => {
    if (role === 'assistant' && message.content && !previousContent.current) setPopulating(true);
    previousContent.current = message.content;
  }, [role, message.content]);
  useEffect(() => {
    if (!populating) return;
    const timer = window.setTimeout(() => setPopulating(false), 300);
    return () => window.clearTimeout(timer);
  }, [populating]);

  const detailCardClass = `rounded-lg bg-brand-surface-elevated/30 border border-brand-surface-border/50 ${isDesktop ? 'p-3' : 'p-2.5'}`;
  const detailTitleClass = `font-medium flex items-center text-brand-text-primary ${isDesktop ? 'text-sm mb-2 gap-2' : 'text-xs mb-1.5 gap-1.5'}`;
  const detailIconClass = isDesktop ? 'w-4 h-4' : 'w-3.5 h-3.5';
  const detailTextClass = `text-brand-text-muted leading-relaxed ${isDesktop ? 'text-sm' : 'text-xs'}`;
  const detailListClass = `${isDesktop ? 'text-sm space-y-1.5 ml-6' : 'text-xs space-y-1 ml-5'} text-brand-text-muted`;
  const insightsId = useId();
  const hintId = useId();
  const hasInsights = !isGameMasterMode && role === 'assistant' && Boolean(
    [message.reasoning, message.memories, message.selfReflection].some(value => value?.trim())
    || message.sensations?.some(value => value.trim()) || message.thoughts?.some(value => value.trim()),
  );

  return (
    <div className={`retro-message-row flex ${isDesktop ? 'gap-4' : 'gap-3'} ${role === 'user' ? 'justify-end' : 'justify-start'}`}
      data-message-role={role} data-message-arriving={message.populateOnMount || undefined} data-message-streaming={message.isTyping || undefined}>
      <div
        ref={containerRef}
        className={`flex min-w-0 flex-col gap-2 ${role === 'assistant' ? 'w-full' : isDesktop ? 'max-w-[85%] sm:max-w-[75%]' : 'max-w-[85%]'}`}
      >
        <div
          className={`retro-message message-bubble rounded-2xl px-4 py-3 ${
            role === 'user'
              ? 'retro-message-user text-white'
              : 'retro-message-assistant text-brand-text-primary'
          } ${populating ? 'animate-text-populate' : ''}`}
        >
          <div className={isDesktop ? 'break-words' : 'break-words text-sm'}>
            <span className={`cosmic-message-sender mb-1 uppercase text-brand-text-muted ${
              isDesktop ? 'text-[11px] tracking-[0.22em]' : 'text-[10px] tracking-[0.2em]'
            } ${role === 'user' ? 'text-brand-accent-secondary' : ''}`}>
              <span className="cosmic-sender-light" aria-hidden="true" />
              {role === 'user' ? 'You' : 'Brain'}
              {hasInsights && <button type="button" className="cosmic-message-affordance" data-expanded={expanded}
                aria-label={expanded ? 'Hide message thoughts' : 'Show message thoughts'} aria-expanded={expanded}
                aria-controls={insightsId} onClick={onToggleExpanded} title={expanded ? 'Hide thoughts' : 'Reveal thoughts'}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>}
            </span>
            <div
              className={`cosmic-chat-prose${hasInsights ? ' cosmic-insight-trigger' : ''}`}
              role={hasInsights ? 'button' : undefined}
              tabIndex={hasInsights ? 0 : undefined}
              aria-expanded={hasInsights ? expanded : undefined}
              aria-controls={hasInsights ? insightsId : undefined}
              aria-describedby={hasInsights ? hintId : undefined}
              aria-busy={visibleContent !== message.content}
              data-chat-arrival={role === 'assistant' && (message.populateOnMount || message.isTyping) ? '' : undefined}
              onPointerDown={hasInsights ? event => {
                const box = event.currentTarget.getBoundingClientRect();
                event.currentTarget.style.setProperty('--message-contact-x', `${event.clientX - box.left}px`);
                event.currentTarget.style.setProperty('--message-contact-y', `${event.clientY - box.top}px`);
              } : undefined}
              onClick={hasInsights ? event => {
                if (event.target instanceof Element && event.target.closest('a, button, input, textarea, select')) return;
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed) return;
                onToggleExpanded();
              } : undefined}
              onKeyDown={hasInsights ? event => {
                if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
                event.preventDefault();
                onToggleExpanded();
              } : undefined}
            >
              <MarkdownContent content={visibleContent} />
            </div>
            {hasInsights && <span id={hintId} className="sr-only">Activate this message to {expanded ? 'hide' : 'reveal'} its thoughts.</span>}
          </div>

          {/* AG-UI tool call cards (Game Master) */}
          {role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-2 space-y-2">
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

          {/* Show additional details when expanded (Brain only) */}
          {hasInsights && (
            <div id={insightsId} className="cosmic-message-insights" data-expanded={expanded}
              ref={node => { if (node) node.inert = !expanded; }}
              role={expanded ? 'region' : undefined} aria-hidden={!expanded} aria-label={expanded ? 'Message thoughts' : undefined}>
              <div className="cosmic-message-insights-clip">
                <div className="cosmic-message-insights-content">
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
                      <div className={`${detailTitleClass} text-brand-accent-primary`}>
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
                      <div className={`${detailTitleClass} text-brand-accent-primary`}>
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

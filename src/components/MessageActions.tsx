import { useEffect, useRef, useState } from 'react';

export default function MessageActions({ content, onListen }: { content: string; onListen?: (content: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      if (!mounted.current) return;
      setCopied(true); setError(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch { if (mounted.current) setError(true); }
  };
  return <div className="cosmic-message-actions" role="group" aria-label="Reply controls">
    {onListen && <button type="button" onClick={() => onListen(content)} title="Hear Brain speak this reply" aria-label="Listen to Brain’s reply">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z" strokeLinejoin="round" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" strokeLinecap="round" /></svg>
      <span>Listen</span>
    </button>}
    <button type="button" onClick={() => { void copy(); }} title="Copy reply" aria-label={copied ? 'Reply copied' : 'Copy reply'} data-copied={copied}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        {copied ? <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" /> : <><rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>}
      </svg><span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
    <span className={error ? 'cosmic-copy-error' : 'sr-only'} role="status">{copied ? 'Reply copied to clipboard.' : error ? 'Select the reply text to copy it.' : ''}</span>
  </div>;
}

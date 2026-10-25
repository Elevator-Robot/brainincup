import { usePageVisible } from '../hooks/usePageVisible';

/** Honest waiting feedback, without fabricated progress or private reasoning. */
export default function ChatActivity({ active }: { active: boolean }) {
  const visible = usePageVisible();
  if (!active) return null;
  return <div className="cosmic-chat-activity" role="status" data-paused={!visible || undefined}>
    <span className="cosmic-activity-dots" aria-hidden="true"><i /><i /><i /></span>
    <span>Brain is thinking<span aria-hidden="true">…</span></span>
  </div>;
}

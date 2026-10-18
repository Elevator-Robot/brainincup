import { useEffect, useState } from 'react';

/** Normal startup is silent; only failed or unusually delayed startup needs UI. */
export default function WorkspaceRecovery({ failed = false }: { failed?: boolean }) {
  const [isDelayed, setIsDelayed] = useState(false);

  useEffect(() => {
    if (failed) return;
    const timeout = window.setTimeout(() => setIsDelayed(true), 15000);
    return () => window.clearTimeout(timeout);
  }, [failed]);

  if (!failed && !isDelayed) return null;

  return (
    <aside className="cosmic-workspace-recovery" role="alert">
      <p>{failed ? 'The workspace could not load.' : 'The workspace is taking longer than expected.'}</p>
      <button type="button" className="cosmic-loading-retry" onClick={() => window.location.reload()}>
        Reload workspace
      </button>
    </aside>
  );
}

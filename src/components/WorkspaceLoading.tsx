import { useEffect, useState } from 'react';

export default function WorkspaceLoading({ failed = false }: { failed?: boolean }) {
  const [isDelayed, setIsDelayed] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsDelayed(true), 15000);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div className="cosmic-loading" role="status" aria-live="polite">
      <img src="/favicon.svg" width="56" height="56" alt="" />
      <h1 className="cosmic-wordmark"><strong>Brain</strong> in Cup</h1>
      <p>{failed ? 'The workspace could not load.' : isDelayed ? 'The workspace is taking longer than expected.' : 'Loading workspace…'}</p>
      {failed || isDelayed ? (
        <button type="button" className="cosmic-loading-retry" onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      ) : <span className="cosmic-loading-light" aria-hidden="true" />}
    </div>
  );
}

export default function WorkspaceLoading() {
  return (
    <div className="cosmic-loading" role="status" aria-live="polite">
      <img src="/favicon.svg" width="56" height="56" alt="" />
      <h1 className="cosmic-wordmark"><strong>Brain</strong> in Cup</h1>
      <p>Loading workspace…</p>
      <span className="cosmic-loading-light" aria-hidden="true" />
    </div>
  );
}

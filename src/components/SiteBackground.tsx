import { usePageVisible } from '../hooks/usePageVisible';

/** CSS-drifting nebula artwork that shares the login's violet/cyan atmosphere. */
export default function SiteBackground() {
  const visible = usePageVisible();
  return (
    <div className="site-background" data-paused={!visible || undefined} aria-hidden="true">
      <img className="site-background-nebula" src="/images/workspace-nebula.svg" width="1800" height="1200" decoding="async" alt="" />
    </div>
  );
}

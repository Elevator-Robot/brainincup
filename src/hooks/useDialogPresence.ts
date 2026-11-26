import { useEffect, useState } from 'react';

/** Retain a closed native dialog for its shared 260ms top-layer exit. */
export function useDialogPresence(open: boolean) {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) { setPresent(true); return; }
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260;
    const timeout = window.setTimeout(() => setPresent(false), duration);
    return () => window.clearTimeout(timeout);
  }, [open]);
  return open || present;
}

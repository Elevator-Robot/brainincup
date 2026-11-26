import { useLayoutEffect, useRef } from 'react';

/** Keep the mobile composer above the software keyboard, including browsers
 * whose layout viewport does not resize. Pinch zoom retains its native viewport. */
export function useWorkspaceViewport() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const viewport = window.visualViewport;
    let frame = 0;
    let focusFrame = 0;
    let width = window.innerWidth;
    let restingHeight = window.innerHeight;
    const update = () => {
      frame = 0;
      if (viewport && viewport.scale !== 1) return;
      if (width !== window.innerWidth) {
        width = window.innerWidth;
        restingHeight = window.innerHeight;
      }
      restingHeight = Math.max(restingHeight, window.innerHeight);
      const height = viewport?.height ?? window.innerHeight;
      const focused = document.activeElement;
      const editing = focused?.matches('textarea, input, [contenteditable="true"]');
      const keyboardOpen = width < 1024 && editing && restingHeight - height > 120;
      workspace.style.setProperty('--workspace-viewport-height', `${height}px`);
      workspace.style.setProperty('--workspace-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      workspace.dataset.keyboardOpen = keyboardOpen ? 'true' : 'false';
      // A modal's scrollport can shrink after the field receives focus. Bring
      // that field back into view without moving the conversation underneath.
      if (keyboardOpen && focused instanceof HTMLElement && focused.closest('dialog[open]')) {
        cancelAnimationFrame(focusFrame);
        focusFrame = requestAnimationFrame(() => {
          if (focused.isConnected && focused === document.activeElement) {
            focused.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
          }
        });
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('resize', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('resize', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
    };
  }, []);
  return workspaceRef;
}

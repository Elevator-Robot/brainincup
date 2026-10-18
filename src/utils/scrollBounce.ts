/** A small viewport translation keeps scroll measurements and die proportions intact. */
export function createScrollBounce(viewport: HTMLElement) {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const previousTranslate = viewport.style.translate;
  let offset = 0;
  let velocity = 0;
  let frame = 0;
  let lastTime = 0;
  let held = false;

  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    offset = velocity = lastTime = 0;
    held = false;
    viewport.style.translate = previousTranslate;
  };

  const tick = (now: number) => {
    frame = 0;
    if (!held) {
      const dt = lastTime ? Math.min(Math.max((now - lastTime) / 1000, 1 / 240), 1 / 30) : 1 / 60;
      velocity += (-320 * offset - 24 * velocity) * dt;
      offset += velocity * dt;
    }
    lastTime = now;
    if (!held && Math.abs(offset) < .1 && Math.abs(velocity) < .5) { reset(); return; }
    viewport.style.translate = `0 ${offset.toFixed(2)}px`;
    if (!held) frame = requestAnimationFrame(tick);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(tick); };
  const pull = (distance: number, hold = false) => {
    if (preference.matches || document.hidden || !Number.isFinite(distance)) return;
    offset = Math.max(-22, Math.min(22, offset + distance * .16 / (1 + Math.abs(offset) / 12)));
    velocity = 0;
    held = hold;
    schedule();
  };
  const release = () => {
    held = false;
    lastTime = 0;
    if (offset) schedule();
  };
  const onPreferenceChange = () => { if (preference.matches) reset(); };
  const onVisibilityChange = () => { if (document.hidden) reset(); };
  preference.addEventListener('change', onPreferenceChange);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    pull, release, reset,
    destroy: () => {
      reset();
      preference.removeEventListener('change', onPreferenceChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}

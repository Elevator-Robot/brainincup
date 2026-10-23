/** Shared artwork and a one-shot login → context-rail handoff. No auth state lives here. */
export const BRAIN_ARTWORK = '/images/login-brain.png';
const STORAGE_KEY = 'brain-in-cup:departure';
const MAX_AGE_MS = 120_000;
const FLIGHT_MS = 1450;
const SETTLE_MS = 1200;
const wakeProgress = new WeakMap<Element, number>();

/** Share the handoff envelope with the shader, without React renders per frame. */
export function getBrainWakeProgress(destination: Element | null): number {
  return destination ? wakeProgress.get(destination) ?? 1 : 1;
}

export interface PortraitBounds { x: number; y: number; width: number; height: number }
interface Departure extends PortraitBounds { at: number; viewportWidth: number; viewportHeight: number }
interface Flight {
  layer: HTMLDivElement;
  portrait: HTMLImageElement;
  destination?: HTMLImageElement;
  observer: MutationObserver;
  timer: number;
  animation?: Animation;
  wakeFrame: number;
  media: MediaQueryList;
  cleanup: () => void;
}
let flight: Flight | null = null;

/** Object-fit: contain's painted image, not its potentially letterboxed element. */
export function portraitBounds(image: HTMLImageElement): PortraitBounds {
  const bounds = image.getBoundingClientRect();
  const ratio = 1672 / 941;
  const width = Math.min(bounds.width, bounds.height * ratio);
  const height = width / ratio;
  return { x: bounds.x + (bounds.width - width) / 2, y: bounds.y + (bounds.height - height) / 2, width, height };
}

/** Sample a smooth, gently rising Bézier arc. Only transforms change during flight. */
export function handoffFrames(from: PortraitBounds, to: PortraitBounds): Keyframe[] {
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = end.x - start.x;
  const lift = Math.min(110, Math.abs(dx) * .22);
  return Array.from({ length: 41 }, (_, index) => {
    const t = index / 40;
    const u = 1 - t;
    const x = u ** 3 * start.x + 3 * u ** 2 * t * (start.x + dx * .22) + 3 * u * t ** 2 * (end.x - dx * .22) + t ** 3 * end.x;
    const y = u ** 3 * start.y + 3 * u ** 2 * t * (start.y - lift) + 3 * u * t ** 2 * (end.y - lift * .4) + t ** 3 * end.y;
    const scale = 1 + (to.width / from.width - 1) * t;
    return {
      offset: t,
      transform: `translate3d(${x - from.width * scale / 2}px, ${y - from.height * scale / 2}px, 0) scale(${scale}) rotate(${-Math.sin(t * Math.PI) * 3}deg)`,
    };
  });
}

/** Remember geometry across a Google/OAuth navigation; never store form contents. */
export function rememberBrainDeparture() {
  const source = document.querySelector<HTMLImageElement>('[data-brain-login]');
  if (!source || window.innerWidth < 1024) return;
  const departure: Departure = { ...portraitBounds(source), at: Date.now(), viewportWidth: innerWidth, viewportHeight: innerHeight };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(departure)); } catch { /* Storage is optional. */ }
}

function takeDeparture(): Departure | null {
  let value: Departure | null = null;
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (saved) value = JSON.parse(saved) as Departure;
  } catch { return null; }
  if (!value || ![value.x, value.y, value.width, value.height, value.at].every(Number.isFinite)
    || value.width <= 0 || value.height <= 0 || Date.now() - value.at > MAX_AGE_MS
    || value.viewportWidth !== innerWidth || value.viewportHeight !== innerHeight) return null;
  return value;
}

export function cancelBrainHandoff() {
  const current = flight;
  if (!current) return;
  flight = null;
  window.clearTimeout(current.timer);
  cancelAnimationFrame(current.wakeFrame);
  current.observer.disconnect();
  current.cleanup();
  current.animation?.cancel();
  if (current.destination) {
    wakeProgress.delete(current.destination);
    current.destination.closest<HTMLElement>('.cosmic-brain-presence')?.style.removeProperty('--brain-wake');
    current.destination.removeAttribute('data-brain-arriving');
  }
  current.layer.remove();
}

/** Called only AFTER authentication succeeds (or by the explicit local preview). */
export function beginBrainHandoff(): boolean {
  if (flight) return true;
  const source = document.querySelector<HTMLImageElement>('[data-brain-login]');
  if (source) rememberBrainDeparture();
  const departure = takeDeparture();
  if (!departure || typeof window.matchMedia !== 'function') return false;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (media.matches || document.hidden || innerWidth < 1024 || typeof Element.prototype.animate !== 'function') return false;

  const layer = document.createElement('div');
  layer.className = 'cosmic-brain-handoff';
  layer.setAttribute('aria-hidden', 'true');
  const portrait = document.createElement('img');
  portrait.src = BRAIN_ARTWORK;
  portrait.alt = '';
  portrait.width = 1672;
  portrait.height = 941;
  Object.assign(portrait.style, {
    width: `${departure.width}px`, height: `${departure.height}px`,
    transform: `translate3d(${departure.x}px, ${departure.y}px, 0)`,
  });
  layer.append(portrait);
  document.body.append(layer);

  const stop = () => cancelBrainHandoff();
  const hidden = () => { if (document.hidden) stop(); };
  window.addEventListener('resize', stop);
  document.addEventListener('visibilitychange', hidden);
  media.addEventListener('change', stop);
  let landing = false;
  const land = async () => {
    if (landing || !flight) return;
    const destination = document.querySelector<HTMLImageElement>('[data-brain-destination]');
    if (!destination) {
      if (document.querySelector('.cosmic-workspace.retro-rpg-ui--gm')) {
        landing = true;
        const current = flight;
        current.animation = portrait.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
        void current.animation.finished.then(() => { if (flight === current) stop(); }).catch(() => {});
      }
      return;
    }
    landing = true;
    const current = flight;
    current.destination = destination;
    const presence = destination.closest<HTMLElement>('.cosmic-brain-presence');
    const setWake = (progress: number) => {
      wakeProgress.set(destination, progress);
      presence?.style.setProperty('--brain-wake', String(progress));
    };
    setWake(0);
    destination.setAttribute('data-brain-arriving', 'true');
    // Pause the resting float before measuring, and share the already-decoded artwork.
    try { await portrait.decode(); } catch { /* A failed image must not leave a hidden destination. */ }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (flight !== current || !destination.isConnected) { if (flight === current) stop(); return; }
    const target = portraitBounds(destination);
    if (!target.width || !target.height) { stop(); return; }
    current.observer.disconnect();
    window.clearTimeout(current.timer);
    current.timer = window.setTimeout(stop, FLIGHT_MS + SETTLE_MS + 300);
    const frames = handoffFrames(departure, target);
    current.animation = portrait.animate(frames, {
      duration: FLIGHT_MS, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards',
    });
    void current.animation.finished.then(() => {
      if (flight !== current || !destination.isConnected) { if (flight === current) stop(); return; }
      // Keep the landed login portrait in front while the living version
      // gradually becomes visible. Never swap two different renders in one frame.
      portrait.style.transform = String(frames[frames.length - 1].transform);
      current.animation?.cancel();
      destination.setAttribute('data-brain-arriving', 'settling');
      current.animation = portrait.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: SETTLE_MS, easing: 'ease-in-out', fill: 'forwards',
      });
      const wake = () => {
        if (flight !== current) return;
        const progress = current.animation?.effect?.getComputedTiming().progress;
        if (typeof progress !== 'number') return;
        // Use the actual eased crossfade progress for motion, material and
        // glow. All reach their idle values together, with zero end velocity.
        setWake(Math.max(0, Math.min(1, progress)));
        if (progress < 1) current.wakeFrame = requestAnimationFrame(wake);
      };
      current.wakeFrame = requestAnimationFrame(wake);
      void current.animation.finished.then(() => {
        if (flight === current) { setWake(1); stop(); }
      }).catch(() => {});
    }).catch(() => {});
  };
  const observer = new MutationObserver(() => { void land(); });
  flight = {
    layer, portrait, observer, media, wakeFrame: 0,
    // GM and mobile retain their own context surfaces; never strand Brain over the chat.
    timer: window.setTimeout(stop, 4000),
    cleanup: () => {
      window.removeEventListener('resize', stop);
      document.removeEventListener('visibilitychange', hidden);
      media.removeEventListener('change', stop);
    },
  };
  observer.observe(document.body, { childList: true, subtree: true });
  void land();
  return true;
}

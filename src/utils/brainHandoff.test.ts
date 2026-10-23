import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginBrainHandoff, cancelBrainHandoff, getBrainWakeProgress, handoffFrames, portraitBounds, rememberBrainDeparture } from './brainHandoff';

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height, toJSON: () => ({}) });
function image(attribute: string) {
  const node = document.createElement('img');
  node.setAttribute(attribute, '');
  node.getBoundingClientRect = () => rect(80, 100, 1000, 700);
  document.body.append(node);
  return node;
}

describe('Brain login handoff', () => {
  let finish: () => void;
  const animate = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    animate.mockImplementation(() => ({ finished: new Promise<void>(resolve => { finish = resolve; }), cancel: vi.fn() }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
    Element.prototype.animate = animate;
  });
  afterEach(() => {
    cancelBrainHandoff();
    document.body.innerHTML = '';
    sessionStorage.clear();
    delete (Element.prototype as Partial<Element>).animate;
    delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    animate.mockClear();
  });

  it('measures the painted source rather than its letterboxed container', () => {
    const source = image('data-brain-login');
    const bounds = portraitBounds(source);
    expect(bounds.width).toBe(1000);
    expect(bounds.height).toBeCloseTo(1000 * 941 / 1672);
    expect(bounds.y).toBeCloseTo(100 + (700 - bounds.height) / 2);
  });

  it('starts and finishes exactly on the source and destination boxes', () => {
    const frames = handoffFrames({ x: 10, y: 20, width: 1000, height: 562.8 }, { x: 1100, y: 60, width: 500, height: 281.4 });
    expect(frames).toHaveLength(41);
    expect(frames[0].transform).toContain('translate3d(10px, 20px, 0) scale(1)');
    expect(frames[40].transform).toContain('translate3d(1100px, 60px, 0) scale(0.5)');
  });

  it('does nothing on an ordinary authenticated refresh', () => {
    expect(beginBrainHandoff()).toBe(false);
    expect(document.querySelector('.cosmic-brain-handoff')).toBeNull();
  });

  it('keeps the landed portrait while crossfading into the active destination', async () => {
    image('data-brain-login');
    const target = image('data-brain-destination');
    expect(beginBrainHandoff()).toBe(true);
    expect(beginBrainHandoff()).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelectorAll('.cosmic-brain-handoff')).toHaveLength(1);
    expect(target).toHaveAttribute('data-brain-arriving', 'true');
    expect(getBrainWakeProgress(target)).toBe(0);
    expect(animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ duration: 1450 }));
    finish();
    await Promise.resolve();
    expect(target).toHaveAttribute('data-brain-arriving', 'settling');
    expect(document.querySelector('.cosmic-brain-handoff')).toBeInTheDocument();
    expect(animate).toHaveBeenLastCalledWith([{ opacity: 1 }, { opacity: 0 }], expect.objectContaining({ duration: 1200 }));
    finish();
    await Promise.resolve();
    expect(target).not.toHaveAttribute('data-brain-arriving');
    expect(getBrainWakeProgress(target)).toBe(1);
    expect(document.querySelector('.cosmic-brain-handoff')).toBeNull();
    vi.advanceTimersByTime(4000);
    expect(document.querySelector('.cosmic-brain-handoff')).toBeNull();
  });

  it('uses one envelope for material, idle motion and glow, with no change at final cleanup', async () => {
    let frame: FrameRequestCallback = () => {};
    let progress = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
    animate.mockImplementation(() => ({
      finished: new Promise<void>(resolve => { finish = resolve; }), cancel: vi.fn(),
      effect: { getComputedTiming: () => ({ progress }) },
    }));
    image('data-brain-login');
    const target = image('data-brain-destination');
    const presence = document.createElement('section');
    presence.className = 'cosmic-brain-presence';
    document.body.append(presence);
    presence.append(target);
    beginBrainHandoff();
    await Promise.resolve();
    frame(0);
    await Promise.resolve();
    finish();
    await Promise.resolve();
    expect(target).toHaveAttribute('data-brain-arriving', 'settling');
    expect(getBrainWakeProgress(target)).toBe(0);
    for (const value of [.25, .75, 1]) {
      progress = value;
      frame(value * 1200);
      expect(getBrainWakeProgress(target)).toBe(value);
      expect(presence.style.getPropertyValue('--brain-wake')).toBe(String(value));
    }
    finish();
    await Promise.resolve();
    expect(getBrainWakeProgress(target)).toBe(1);
    expect(presence.style.getPropertyValue('--brain-wake')).toBe('');
    expect(target).not.toHaveAttribute('data-brain-arriving');
  });

  it('remembers only artwork geometry across an OAuth redirect and consumes it once', () => {
    const source = image('data-brain-login');
    rememberBrainDeparture();
    const saved = JSON.parse(sessionStorage.getItem('brain-in-cup:departure') ?? '{}');
    expect(Object.keys(saved).sort()).toEqual(['at', 'height', 'viewportHeight', 'viewportWidth', 'width', 'x', 'y']);
    source.remove();
    expect(beginBrainHandoff()).toBe(true);
    cancelBrainHandoff();
    expect(beginBrainHandoff()).toBe(false);
  });

  it('rejects old OAuth snapshots', () => {
    const source = image('data-brain-login');
    rememberBrainDeparture();
    source.remove();
    vi.advanceTimersByTime(120_001);
    expect(beginBrainHandoff()).toBe(false);
  });

  it('uses no flight with reduced motion or on a phone', () => {
    image('data-brain-login');
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    expect(beginBrainHandoff()).toBe(false);
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    expect(beginBrainHandoff()).toBe(false);
    expect(animate).not.toHaveBeenCalled();
  });

  it('reveals the target immediately if the viewport changes during flight', async () => {
    image('data-brain-login');
    const target = image('data-brain-destination');
    beginBrainHandoff();
    await Promise.resolve();
    await Promise.resolve();
    window.dispatchEvent(new Event('resize'));
    expect(target).not.toHaveAttribute('data-brain-arriving');
    expect(document.querySelector('.cosmic-brain-handoff')).toBeNull();
  });

  it('can cancel the settling phase without stranding an overlay or hiding Brain', async () => {
    image('data-brain-login');
    const target = image('data-brain-destination');
    beginBrainHandoff();
    await Promise.resolve();
    await Promise.resolve();
    finish();
    await Promise.resolve();
    expect(target).toHaveAttribute('data-brain-arriving', 'settling');
    window.dispatchEvent(new Event('resize'));
    expect(target).not.toHaveAttribute('data-brain-arriving');
    expect(document.querySelector('.cosmic-brain-handoff')).toBeNull();
    finish();
    await Promise.resolve();
    expect(document.querySelector('.cosmic-brain-handoff')).toBeNull();
  });

  it('cleans up if no destination ever mounts', () => {
    image('data-brain-login');
    beginBrainHandoff();
    vi.advanceTimersByTime(4000);
    expect(document.querySelector('.cosmic-brain-handoff')).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BrainPresence from './BrainPresence';
import { BRAIN_ARTWORK } from '../utils/brainHandoff';

// The GPU renderer is browser-tested separately; these tests cover its passive API.
vi.mock('./LivingBrain', () => ({ default: ({ activity, energy }: { activity: number; energy: number }) =>
  <canvas data-testid="living-brain" data-activity={activity} data-energy={energy} /> }));

describe('BrainPresence', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('uses the same portrait as login, with a reserved landing destination', () => {
    const { container } = render(<BrainPresence mood="thinking" intensity={80} />);
    const image = container.querySelector('[data-brain-destination]');
    expect(image).toHaveAttribute('src', BRAIN_ARTWORK);
    expect(image).toHaveAttribute('width', '1672');
    expect(image).toHaveAttribute('height', '941');
    expect(screen.getByRole('region')).toHaveAttribute('data-mood', 'thinking');
    expect(screen.getByRole('region').style.getPropertyValue('--brain-energy')).toBe('0.8');
  });

  it('has no controls, focus stops, drag handles, or click actions', () => {
    const { container } = render(<BrainPresence mood="listening" />);
    const stage = screen.getByRole('img', { name: 'Brain, listening' });
    const before = container.innerHTML;
    fireEvent.pointerMove(stage, { clientX: 100, clientY: 100 });
    fireEvent.pointerDown(stage);
    fireEvent.pointerMove(stage, { clientX: 150, clientY: 130 });
    fireEvent.pointerUp(stage);
    fireEvent.click(stage);
    expect(container.innerHTML).toBe(before);
    expect(container.querySelector('button, a, input, [tabindex]')).toBeNull();
    expect(container.querySelector('[data-dragging], .cosmic-brain-touch')).toBeNull();
    expect(screen.getByRole('region').textContent).toBe('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('gently follows an unpressed mouse within its box and resets without clearing other styles', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('pointer: fine'), addEventListener() {}, removeEventListener() {},
    }));
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    render(<BrainPresence />);
    const presence = screen.getByRole('region');
    vi.spyOn(presence, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 200, 300, 300));
    presence.style.setProperty('--brain-wake', '0.6');
    const move = (buttons: number, pointerType = 'mouse') => {
      const event = new Event('pointermove', { bubbles: true });
      Object.assign(event, { pointerType, buttons, clientX: 400, clientY: 200 });
      fireEvent(presence, event);
      const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(16));
    };
    move(0);
    expect(presence.style.getPropertyValue('--brain-gaze-x')).toBe('4.00px');
    expect(presence.style.getPropertyValue('--brain-gaze-y')).toBe('-3.00px');
    expect(presence.style.getPropertyValue('--brain-gaze-rx')).toBe('2.00deg');
    expect(presence.style.getPropertyValue('--brain-gaze-ry')).toBe('3.00deg');
    fireEvent.pointerOut(presence);
    expect(presence.style.getPropertyValue('--brain-gaze-x')).toBe('');
    expect(presence.style.getPropertyValue('--brain-energy')).toBe('0.35');
    expect(presence.style.getPropertyValue('--brain-wake')).toBe('0.6');
    const destination = presence.querySelector('[data-brain-destination]')!;
    destination.setAttribute('data-brain-arriving', 'settling');
    move(0);
    expect(presence.style.getPropertyValue('--brain-gaze-x')).toBe('');
    destination.removeAttribute('data-brain-arriving');
    move(1);
    move(0, 'touch');
    expect(presence.style.getPropertyValue('--brain-gaze-x')).toBe('');
    expect(presence.querySelector('button, [data-dragging]')).toBeNull();
  });

  it('updates conversation activity without remounting the landing image', () => {
    const { container, rerender } = render(<BrainPresence mood="listening" />);
    const image = container.querySelector('img');
    rerender(<BrainPresence mood="thinking" />);
    expect(screen.getByRole('img', { name: 'Brain, thinking' })).toBeInTheDocument();
    expect(screen.getByTestId('living-brain')).toHaveAttribute('data-activity', '0.45');
    rerender(<BrainPresence mood="speaking" />);
    expect(screen.getByRole('region')).toHaveAttribute('data-mood', 'speaking');
    expect(screen.getByTestId('living-brain')).toHaveAttribute('data-activity', '1');
    expect(container.querySelector('.cosmic-brain-neural-flow')).toBeInTheDocument();
    expect(container.querySelector('img')).toBe(image);
    rerender(<BrainPresence mood="listening" />);
    expect(screen.getByTestId('living-brain')).toHaveAttribute('data-activity', '0.05');
  });

  it('winds speaking down gradually without resetting the neural animation phase', () => {
    let now = 0;
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const advance = (ms: number) => {
      for (let elapsed = 0; elapsed < ms; elapsed += 16) {
        now += 16;
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach(callback => callback(now));
      }
    };
    const signal = {
      animationName: 'cosmic-brain-signal', playbackRate: 1, currentTime: 1234,
      updatePlaybackRate: vi.fn((rate: number) => { signal.playbackRate = rate; }),
    };
    const { rerender, unmount } = render(<BrainPresence mood="listening" />);
    screen.getByRole('region').getAnimations = () => [signal as unknown as Animation];
    rerender(<BrainPresence mood="speaking" />);
    advance(3000);
    const speakingRate = signal.playbackRate;
    expect(speakingRate).toBeCloseTo(4.6 / 1.7, 2);

    rerender(<BrainPresence mood="listening" />);
    expect(signal.playbackRate).toBe(speakingRate);
    advance(200);
    expect(signal.playbackRate).toBeLessThan(speakingRate);
    expect(signal.playbackRate).toBeGreaterThan(1.8);
    advance(1400);
    expect(signal.playbackRate).toBeGreaterThan(1);
    expect(signal.playbackRate).toBeLessThan(1.4);
    advance(4000);
    expect(signal.playbackRate).toBe(1);
    expect(signal.currentTime).toBe(1234);

    rerender(<BrainPresence mood="speaking" />);
    expect(frames.size).toBeGreaterThan(0);
    unmount();
    expect(frames.size).toBe(0);
  });

  it.each([[-40, '0'], [180, '1'], [NaN, '0.35']])('bounds the glow intensity %s', (intensity, expected) => {
    render(<BrainPresence intensity={intensity} />);
    expect(screen.getByRole('region').style.getPropertyValue('--brain-energy')).toBe(expected);
    expect(screen.getByTestId('living-brain')).toHaveAttribute('data-energy', expected);
  });

  it('pauses ambient motion when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<BrainPresence />);
    expect(screen.getByRole('region')).toHaveAttribute('data-reduced-motion', 'true');
    expect(screen.queryByTestId('living-brain')).toBeNull();
    expect(screen.getByRole('region').textContent).toBe('');
  });

  it('releases the renderer and pauses ambient motion in a background tab', () => {
    render(<BrainPresence />);
    expect(screen.getByTestId('living-brain')).toBeInTheDocument();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.queryByTestId('living-brain')).toBeNull();
    expect(screen.getByRole('region')).toHaveAttribute('data-paused', 'true');
  });

  it('needs no event timers', () => {
    const { unmount } = render(<BrainPresence />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

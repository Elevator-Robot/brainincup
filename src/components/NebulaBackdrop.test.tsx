import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import NebulaBackdrop from './NebulaBackdrop';

const engine = vi.hoisted(() => ({ create: vi.fn(), setMotion: vi.fn(), resize: vi.fn(), destroy: vi.fn() }));
vi.mock('../graphics/nebulaRenderer', () => ({ createNebulaRenderer: engine.create }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('WebGLRenderingContext', class {});
  engine.create.mockReturnValue({ setMotion: engine.setMotion, resize: engine.resize, destroy: engine.destroy });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('pauses and respects reduced motion without recreating the GPU context', () => {
  const { rerender } = render(<NebulaBackdrop paused={false} reducedMotion={false} />);
  expect(engine.create).toHaveBeenCalledOnce();
  rerender(<NebulaBackdrop paused reducedMotion={false} />);
  expect(engine.setMotion).toHaveBeenLastCalledWith(true, false);
  rerender(<NebulaBackdrop paused={false} reducedMotion />);
  expect(engine.setMotion).toHaveBeenLastCalledWith(false, true);
  expect(engine.create).toHaveBeenCalledOnce();
});
it('recovers from context loss and cleans up listeners/resources on unmount', () => {
  const { container, unmount } = render(<NebulaBackdrop paused={false} reducedMotion={false} />);
  const canvas = container.querySelector('canvas')!;
  fireEvent(canvas, new Event('webglcontextlost', { cancelable: true }));
  expect(engine.destroy).toHaveBeenCalledOnce();
  expect(canvas).toHaveAttribute('data-context-lost', 'true');
  fireEvent(canvas, new Event('webglcontextrestored'));
  expect(engine.create).toHaveBeenCalledTimes(2);
  unmount();
  expect(engine.destroy).toHaveBeenCalledTimes(2);
  fireEvent(canvas, new Event('webglcontextrestored'));
  expect(engine.create).toHaveBeenCalledTimes(2);
});

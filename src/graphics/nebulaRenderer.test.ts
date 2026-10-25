import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNebulaRenderer, nebulaResolution } from './nebulaRenderer';

const frames = new Map<number, FrameRequestCallback>();
let sequence = 0;
beforeEach(() => {
  frames.clear(); sequence = 0;
  vi.stubGlobal('devicePixelRatio', 2);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup() {
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, MAX_RENDERBUFFER_SIZE: 5,
    createProgram: vi.fn(() => ({})), createBuffer: vi.fn(() => ({})), createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(), compileShader: vi.fn(), getShaderParameter: vi.fn(() => true),
    attachShader: vi.fn(), linkProgram: vi.fn(), getProgramParameter: vi.fn(() => true),
    useProgram: vi.fn(), bindBuffer: vi.fn(), bufferData: vi.fn(), getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(), vertexAttribPointer: vi.fn(), getUniformLocation: vi.fn(() => ({})),
    getParameter: vi.fn(() => 8192), uniform2f: vi.fn(), uniform1f: vi.fn<WebGLRenderingContext['uniform1f']>(), drawArrays: vi.fn(),
    viewport: vi.fn(), isContextLost: vi.fn(() => false), deleteShader: vi.fn(), deleteProgram: vi.fn(), deleteBuffer: vi.fn(),
  };
  const canvas = document.createElement('canvas');
  // getContext has WebGL/2D/WebGPU overloads; this test supplies only WebGL.
  vi.spyOn(canvas, 'getContext').mockReturnValue(gl as never);
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1920, 1080));
  return { canvas, gl };
}
const advance = (now: number) => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(now)); };

it('uses native UHD pixels on a retina 1080p viewport', () => {
  expect(nebulaResolution(1920, 1080, 2)).toEqual({ width: 3840, height: 2160 });
  expect(nebulaResolution(3840, 2160, 1)).toEqual({ width: 3840, height: 2160 });
});
it('bounds extreme displays while preserving aspect ratio and pixel density on mobile', () => {
  const huge = nebulaResolution(7680, 4320, 2);
  expect(huge.width * huge.height).toBeLessThanOrEqual(3840 * 2160);
  expect(huge.width / huge.height).toBeCloseTo(16 / 9, 2);
  expect(nebulaResolution(390, 844, 3)).toEqual({ width: 1170, height: 2532 });
  expect(nebulaResolution(0, Number.NaN, 0)).toEqual({ width: 1, height: 1 });
});
it('draws at full density but caps the animation cadence and stops when paused', () => {
  const { canvas, gl } = setup();
  const renderer = createNebulaRenderer(canvas)!;
  expect(canvas.width).toBe(3840); expect(canvas.height).toBe(2160);
  expect(gl.drawArrays).not.toHaveBeenCalled();
  renderer.setMotion(false, false);
  for (let frame = 0; frame <= 60; frame++) advance(frame * 1000 / 60);
  expect(gl.drawArrays.mock.calls.length).toBeGreaterThanOrEqual(23);
  expect(gl.drawArrays.mock.calls.length).toBeLessThanOrEqual(25);
  expect(canvas.dataset.ready).toBe('true');
  renderer.setMotion(true, false);
  expect(frames.size).toBe(0);
  const draws = gl.drawArrays.mock.calls.length;
  renderer.resize();
  expect(gl.drawArrays).toHaveBeenCalledTimes(draws);
  renderer.destroy();
  expect(gl.deleteProgram).toHaveBeenCalledOnce();
  expect(gl.deleteBuffer).toHaveBeenCalledOnce();
  expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  expect(canvas.dataset.ready).toBeUndefined();
});
it('renders one sharp, still frame for reduced motion and resumes without a time jump', () => {
  const { canvas, gl } = setup();
  const renderer = createNebulaRenderer(canvas)!;
  renderer.setMotion(false, false); advance(0); advance(50);
  const time = gl.uniform1f.mock.calls.at(-1)?.[1];
  renderer.setMotion(true, false);
  renderer.setMotion(false, true);
  expect(frames.size).toBe(0);
  renderer.setMotion(false, false); advance(600_000);
  expect(gl.uniform1f.mock.calls.at(-1)?.[1]).toBe(time);
  renderer.destroy();
});
it('leaves the fallback available and releases allocations when compilation fails', () => {
  const { canvas, gl } = setup();
  gl.getShaderParameter.mockReturnValue(false);
  expect(createNebulaRenderer(canvas)).toBeNull();
  expect(canvas.dataset.ready).toBeUndefined();
  expect(gl.deleteProgram).toHaveBeenCalledOnce();
  expect(frames.size).toBe(0);
});

import { NEBULA_FRAGMENT, NEBULA_VERTEX } from './nebulaShader';

const UHD_PIXELS = 3840 * 2160;

/** Native density up to an actual UHD framebuffer; never upscale a low-res
 * intermediate texture. Very large displays retain aspect ratio within budget. */
export function nebulaResolution(width: number, height: number, dpr: number, maxDimension = 8192) {
  const safe = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? value : fallback;
  const w = safe(width, 1), h = safe(height, 1), density = Math.min(safe(dpr, 1), 3);
  const scale = Math.min(density, Math.sqrt(UHD_PIXELS / (w * h)), maxDimension / w, maxDimension / h);
  return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)) };
}

export interface NebulaRenderer {
  setMotion: (paused: boolean, reduced: boolean) => void;
  resize: () => void;
  destroy: () => void;
}

export function createNebulaRenderer(canvas: HTMLCanvasElement): NebulaRenderer | null {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return null;
  let frame = 0, elapsed = 0, previous: number | null = null, lastDraw = -Infinity;
  let paused = true, reduced = false, disposed = false;
  let attentionX = 0, attentionY = 0;
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    shaders.forEach(shader => gl.deleteShader(shader));
    gl.deleteProgram(program); gl.deleteBuffer(buffer);
    delete canvas.dataset.ready;
  };
  const compile = (kind: number, source: string) => {
    const shader = gl.createShader(kind);
    if (!shader) return null;
    shaders.push(shader);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vertex = compile(gl.VERTEX_SHADER, NEBULA_VERTEX);
  const fragment = compile(gl.FRAGMENT_SHADER, NEBULA_FRAGMENT);
  if (!program || !buffer || !vertex || !fragment) { destroy(); return null; }
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { destroy(); return null; }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  if (position < 0) { destroy(); return null; }
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(['resolution', 'attention', 'time'].map(name => [name, gl.getUniformLocation(program, name)]));
  const hardwareLimit = Math.min(8192, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 8192);
  const paint = () => {
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.attention, attentionX, attentionY);
    gl.uniform1f(uniforms.time, elapsed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (!gl.isContextLost()) { canvas.dataset.ready = 'true'; delete canvas.dataset.contextLost; }
  };
  const resize = () => {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    const size = nebulaResolution(bounds.width, bounds.height, window.devicePixelRatio, hardwareLimit);
    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width; canvas.height = size.height;
      gl.viewport(0, 0, size.width, size.height);
    }
    if (!paused) paint();
  };
  const draw = (now: number) => {
    if (disposed || paused || reduced) { frame = 0; return; }
    const dt = previous === null ? 0 : Math.min(.1, (now - previous) / 1000);
    previous = now;
    elapsed += dt;
    const style = canvas.parentElement?.style;
    const x = Number.parseFloat(style?.getPropertyValue('--ambient-x') || '0') / 14;
    const y = Number.parseFloat(style?.getPropertyValue('--ambient-y') || '0') / 10;
    const ease = 1 - Math.exp(-dt / 1.1);
    attentionX += (x - attentionX) * ease; attentionY += (y - attentionY) * ease;
    // Cinematic cadence limits fullscreen GPU work without lowering resolution.
    const interval = 1000 / 24;
    if (now - lastDraw >= interval) {
      paint();
      lastDraw = Number.isFinite(lastDraw) ? now - ((now - lastDraw) % interval) : now;
    }
    frame = requestAnimationFrame(draw);
  };
  resize();
  return {
    resize, destroy,
    setMotion(nextPaused, nextReduced) {
      paused = nextPaused; reduced = nextReduced;
      cancelAnimationFrame(frame); frame = 0; previous = null; lastDraw = -Infinity;
      if (!paused && !reduced && !disposed) frame = requestAnimationFrame(draw);
      else if (!paused && !disposed) paint();
    },
  };
}

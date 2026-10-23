import { useEffect, useRef, useState } from 'react';
import { BRAIN_ARTWORK, getBrainWakeProgress } from '../utils/brainHandoff';

const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = vec2(position.x * .5 + .5, .5 - position.y * .5);
  gl_Position = vec4(position, 0., 1.);
}`;

// Layer slow, independent noise fields, inspired by the living-photograph
// approach in Codrops' Until Labs case study. No pointer inputs or impulse rings.
// Keep the original silhouette and light only its existing neural folds.
const FRAGMENT = `
precision highp float;
uniform sampler2D portrait;
uniform float time;
uniform float flowTime;
uniform float activity;
uniform float energy;
uniform float wake;
varying vec2 uv;
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * f * (f * (f * 6. - 15.) + 10.);
  return mix(mix(hash(cell), hash(cell + vec2(1., 0.)), w.x),
             mix(hash(cell + vec2(0., 1.)), hash(cell + 1.), w.x), w.y);
}
float layered(vec2 p) {
  return noise(p) * .57 + noise(mat2(.8, -.6, .6, .8) * p * 2.07 + 17.) * .28
    + noise(mat2(.6, .8, -.8, .6) * p * 4.13 - 9.) * .15;
}
void main() {
  vec2 center = uv - vec2(.5, .52);
  float breath = sin(time * 1.08) * .024 + sin(time * .63 + .6) * .006;
  vec2 flow = vec2(layered(uv * 8. + vec2(time * .16, -time * .12)),
                   layered(uv * 8. + vec2(-time * .13, time * .18) + 37.)) - .5;
  vec2 sampleUV = uv + (-center * breath + flow * (.014 + activity * .006)) * wake;
  vec4 tissue = texture2D(portrait, clamp(sampleUV, 0., 1.));
  float veins = smoothstep(.48, .94, max(tissue.g, tissue.b));
  float current = smoothstep(.52, .78, noise(uv * vec2(28., 20.) + flow * 3. + vec2(flowTime, -flowTime * .7)));
  float glints = pow(noise(uv * 75. + flow * 5. + flowTime * .6), 9.);
  float answering = (.3 + activity * .75) * (.8 + energy * .2);
  vec3 light = mix(vec3(.48, .22, .95), vec3(.35, .90, 1.), flow.x + .5);
  // Give moving light real contrast against the already-luminous photograph.
  // Merely adding faint highlights to a bright image was barely perceptible.
  tissue.rgb *= mix(1., .84 + breath * 2.5 + current * .18, wake);
  tissue.rgb += light * veins * (current * answering + glints * (.2 + activity * .6)) * wake;
  gl_FragColor = vec4(tissue.rgb, tissue.a);
}`;

/** Optional GPU enhancement; the real image stays underneath as a safe fallback. */
export default function LivingBrain({ activity, energy }: { activity: number; energy: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const target = useRef({ activity, energy });
  target.current = { activity, energy };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof WebGLRenderingContext === 'undefined') return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false });
    if (!gl) return;
    let disposed = false;
    let frame = 0;
    const shaders: WebGLShader[] = [];
    const shader = (kind: number, code: string) => {
      const result = gl.createShader(kind);
      if (!result) return null;
      shaders.push(result);
      gl.shaderSource(result, code);
      gl.compileShader(result);
      return gl.getShaderParameter(result, gl.COMPILE_STATUS) ? result : null;
    };
    const vertex = shader(gl.VERTEX_SHADER, VERTEX);
    const fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    const release = () => {
      cancelAnimationFrame(frame);
      shaders.forEach(value => gl.deleteShader(value));
      gl.deleteProgram(program); gl.deleteBuffer(buffer); gl.deleteTexture(texture);
    };
    if (!vertex || !fragment || !program || !buffer || !texture) { release(); return; }
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { release(); return; }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const destination = canvas.parentElement?.querySelector('[data-brain-destination]') ?? null;
    const uniforms = Object.fromEntries(['time', 'flowTime', 'activity', 'energy', 'wake'].map(name => [name, gl.getUniformLocation(program, name)]));
    const resize = () => {
      canvas.width = Math.min(1024, Math.max(1, Math.round(canvas.getBoundingClientRect().width * Math.min(devicePixelRatio, 2))));
      canvas.height = Math.round(canvas.width * 941 / 1672);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const start = performance.now();
    let currentActivity = 0;
    let currentEnergy = target.current.energy;
    let flowTime = 0;
    let previous = start;
    const draw = (now: number) => {
      if (disposed) return;
      const delta = Math.min(100, now - previous);
      const ease = 1 - Math.exp(-delta / (target.current.activity < currentActivity ? 900 : 550));
      previous = now;
      currentActivity += (target.current.activity - currentActivity) * ease;
      currentEnergy += (target.current.energy - currentEnergy) * ease;
      // Integrate speed rather than multiplying time by activity: speaking can
      // become more energetic without jumping to a different animation phase.
      flowTime += delta / 1000 * (.42 + currentActivity * .9);
      gl.uniform1f(uniforms.time, (now - start) / 1000);
      gl.uniform1f(uniforms.flowTime, flowTime);
      gl.uniform1f(uniforms.activity, currentActivity);
      gl.uniform1f(uniforms.energy, currentEnergy);
      gl.uniform1f(uniforms.wake, getBrainWakeProgress(destination));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      frame = requestAnimationFrame(draw);
    };
    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      draw(performance.now());
      setReady(true);
    };
    image.src = BRAIN_ARTWORK;
    const lost = (event: Event) => { event.preventDefault(); disposed = true; cancelAnimationFrame(frame); setReady(false); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      disposed = true;
      image.onload = null;
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      release();
    };
  }, []);
  return <canvas ref={ref} className="cosmic-brain-living" data-ready={ready} aria-hidden="true" />;
}

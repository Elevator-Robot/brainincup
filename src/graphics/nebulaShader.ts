export const NEBULA_VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0., 1.); }
`;

/** Domain-warped light and shadow, not a scaled texture or a looping video.
 * Fine filaments sit inside broad mist. Weak, imperfect bilateral correlation
 * creates fleeting pareidolia without drawing eyes, faces, rings, or symbols. */
export const NEBULA_FRAGMENT = `
precision highp float;
uniform vec2 resolution;
uniform vec2 attention;
uniform float time;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x),
             mix(hash(i + vec2(0., 1.)), hash(i + 1.), u.x), u.y);
}
float cloud(vec2 p) {
  mat2 turn = mat2(.8, -.6, .6, .8);
  float n = .53 * noise(p);
  p = turn * p * 2.09 + 17.1;
  n += .27 * noise(p);
  p = turn * p * 2.07 - 9.4;
  n += .13 * noise(p);
  p = turn * p * 2.03 + 21.8;
  return n + .07 * noise(p);
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec2 p = (uv - .5) * vec2(resolution.x / resolution.y, 1.) * 3.2;
  vec2 drift = vec2(time * .043, -time * .026);
  vec2 warp = vec2(noise(p * .73 + drift), noise(p * .81 - drift * .8 + 31.)) - .5;
  vec2 gaze = attention * .055;
  float depth = cloud(p * 1.12 + warp * 2.0 + drift - gaze);
  float near = cloud(p * 2.85 + warp * 2.4 - drift * .67 + gaze * .4 + 12.);
  float ridge = pow(clamp(1. - abs(near * 2. - 1.), 0., 1.), 8.);
  float fine = noise(p * 25. + warp * 5. + depth * 4. - drift * .4);
  float lace = noise(p * vec2(43., 67.) + warp * 5. + depth * 3. + drift * .2);

  // Two currents never quite agree. The suggestion of symmetry comes and goes.
  vec2 folded = vec2(abs(p.x + .12 * sin(time * .07)), p.y);
  float almost = noise(folded * 2.1 + warp * .7 + vec2(0., time * .016));
  float presence = (.05 + .07 * sin(time * .13 + 1.4)) * almost;
  float breath = .86 + .07 * sin(time * .34) + .045 * sin(time * .57 + 1.7);
  float mist = smoothstep(.19, .79, depth + presence);
  float violetSide = 1. - smoothstep(-.85, .55, p.x + warp.y * 1.4);
  vec3 violet = vec3(.28, .12, .49);
  vec3 cyan = vec3(.055, .34, .42);
  vec3 color = vec3(.018, .025, .059);
  color += mix(cyan, violet, violetSide) * mist * breath * (.8 + fine * .13 + lace * .07);
  color += mix(vec3(.12, .29, .38), vec3(.32, .20, .48), near) * ridge * mist * (.085 + fine * .08);
  // Occluding folds make the light feel behind something, not painted on glass.
  float shadow = smoothstep(.38, .72, near + depth * .15);
  color *= 1. - shadow * .27;
  float hush = exp(-dot(p * vec2(.56, .7), p * vec2(.56, .7)));
  color *= 1. - hush * .23;

  // Sparse, subpixel stars at native framebuffer density, not a tiled grid.
  vec2 field = (uv - .5) * vec2(resolution.x / resolution.y, 1.) * 170.;
  field += attention * .16 + vec2(time * .014, time * -.008);
  vec2 cell = floor(field), local = fract(field);
  float seed = hash(cell + 91.);
  vec2 center = vec2(hash(cell + 4.), hash(cell + 19.)) * .7 + .15;
  vec2 starPixels = (local - center) * resolution.y / 170.;
  float distance2 = dot(starPixels, starPixels);
  float star = (exp(-distance2 * 1.9) + exp(-distance2 * .09) * .035) * step(.996, seed);
  color += vec3(.44, .58, .78) * star * (.45 + .25 * sin(time * .29 + seed * 81.));
  // Stable one-bit-scale dithering prevents flat 8-bit gradient bands.
  color += (hash(gl_FragCoord.xy) - .5) / 255.;
  gl_FragColor = vec4(max(color, 0.), 1.);
}
`;

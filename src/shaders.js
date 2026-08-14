// GLSL sources for the recursive mirror tunnel.

const NOISE = /* glsl */ `
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p){
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++){
    s += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}

float potential(vec2 p, float t){
  return fbm(p + vec2(0.0, t * 0.6)) + fbm(p * 1.73 - vec2(t * 0.42, t * 0.11));
}

vec2 curl2(vec2 p, float t){
  const float e = 0.05;
  float n1 = potential(p + vec2(0.0, e), t);
  float n2 = potential(p - vec2(0.0, e), t);
  float n3 = potential(p + vec2(e, 0.0), t);
  float n4 = potential(p - vec2(e, 0.0), t);
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
}
`;

const PALETTE = /* glsl */ `
uniform vec3 uPalA;
uniform vec3 uPalB;
uniform vec3 uPalC;
uniform vec3 uPalD;

vec3 palette(float t){
  return uPalA + uPalB * cos(6.28318530718 * (uPalC * t + uPalD));
}
`;

// Rodrigues rotation about the grey axis: shifts hue without touching luminance.
const HUE = /* glsl */ `
vec3 hueRotate(vec3 c, float a){
  const vec3 k = vec3(0.57735026919);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
`;

export const fullscreenVert = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// r = luminance this frame, g = motion energy, b = edge magnitude.
export const motionFrag = /* glsl */ `
precision highp float;

uniform sampler2D uVideo;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform vec2 uCoverScale;
uniform float uDecay;
uniform float uHasVideo;
uniform float uGlobalShift;
uniform float uTime;
varying vec2 vUv;

${NOISE}

float lum(vec2 uv){
  vec2 t = (uv - 0.5) * uCoverScale + 0.5;
  t.x = 1.0 - t.x;
  return dot(texture2D(uVideo, clamp(t, 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
}

void main(){
  vec4 prev = texture2D(uPrev, vUv);
  float c = lum(vUv);

  float l = lum(vUv - vec2(uTexel.x, 0.0));
  float r = lum(vUv + vec2(uTexel.x, 0.0));
  float d = lum(vUv - vec2(0.0, uTexel.y));
  float u = lum(vUv + vec2(0.0, uTexel.y));
  float dl = lum(vUv - uTexel);
  float dr = lum(vUv + vec2(uTexel.x, -uTexel.y));
  float ul = lum(vUv + vec2(-uTexel.x, uTexel.y));
  float ur = lum(vUv + uTexel);

  vec2 sobel = vec2(
    (ur + 2.0 * r + dr) - (ul + 2.0 * l + dl),
    (ul + 2.0 * u + ur) - (dl + 2.0 * d + dr)
  );
  float edge = clamp(length(sobel) * 0.9, 0.0, 1.0);
  // Subtracting the frame-wide luminance shift stops webcam auto-exposure from
  // registering as movement across the entire image.
  float motion = smoothstep(0.030, 0.26, abs(c - prev.r - uGlobalShift));

  if (uHasVideo < 0.5){
    vec2 p = vUv * 3.0;
    float n = fbm(p + vec2(uTime * 0.2, -uTime * 0.14));
    motion = smoothstep(0.45, 0.95, n);
    edge = smoothstep(0.5, 0.85, fbm(p * 2.1 - vec2(uTime * 0.1)));
    c = n;
  }

  float held = max(prev.g * uDecay, motion);
  gl_FragColor = vec4(c, held, edge, 1.0);
}
`;

// The heart of the piece: last frame is folded, spun, zoomed, hue-shifted and
// prism-split, then this frame's motion is injected as ink.
export const feedbackFrag = /* glsl */ `
precision highp float;

uniform sampler2D uPrev;
uniform sampler2D uMotion;
uniform sampler2D uBodyTex;
uniform float uAspect;
uniform float uTime;
uniform float uFold;
uniform float uRotStep;
uniform float uZoomStep;
uniform float uWarpStep;
uniform float uHueStep;
uniform float uDecayStep;
uniform float uChroma;
uniform float uInk;
uniform float uEdgeInk;
uniform float uEnergy;
uniform float uSharp;
uniform float uFloor;
uniform vec2 uTexel;
varying vec2 vUv;

${NOISE}
${PALETTE}
${HUE}

vec2 fold(vec2 uv){
  if (uFold < 1.5) return uv;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float a = atan(p.y, p.x);
  float seg = 6.28318530718 / uFold;
  a = mod(a + 3.14159265359, seg);
  a = abs(a - seg * 0.5);
  return vec2(cos(a), sin(a)) * length(p) / vec2(uAspect, 1.0) + 0.5;
}

vec2 warpUV(vec2 uv, float rscale){
  vec2 p = (fold(uv) - 0.5) * vec2(uAspect, 1.0);
  float a = atan(p.y, p.x);
  float r = max(length(p), 0.004); // keep off the polar singularity

  a += uRotStep;
  r *= uZoomStep * rscale;

  vec2 q = vec2(cos(a), sin(a)) * r;
  q += curl2(q * 2.2, uTime * 0.4) * uWarpStep;
  return q / vec2(uAspect, 1.0) + 0.5;
}

void main(){
  // Per-channel radius offset; compounded every frame it becomes prismatic.
  vec2 ur = warpUV(vUv, 1.0 + uChroma);
  vec2 ug = warpUV(vUv, 1.0);
  vec2 ub = warpUV(vUv, 1.0 - uChroma);
  vec3 prev = vec3(
    texture2D(uPrev, ur).r,
    texture2D(uPrev, ug).g,
    texture2D(uPrev, ub).b
  );

  // Every frame resamples with bilinear filtering, which compounds into blur.
  // An unsharp term and a black floor keep the loop from collapsing into mush.
  vec3 blur = (
      texture2D(uPrev, ug + vec2(uTexel.x, 0.0)).rgb
    + texture2D(uPrev, ug - vec2(uTexel.x, 0.0)).rgb
    + texture2D(uPrev, ug + vec2(0.0, uTexel.y)).rgb
    + texture2D(uPrev, ug - vec2(0.0, uTexel.y)).rgb
  ) * 0.25;
  prev += (prev - blur) * uSharp;

  prev = hueRotate(prev, uHueStep) * uDecayStep;
  prev = max(prev - uFloor, vec3(0.0));

  vec3 m = texture2D(uMotion, fold(vUv)).rgb;
  float motion = clamp(m.g, 0.0, 1.0);
  float edge = clamp(texture2D(uBodyTex, fold(vUv)).r, 0.0, 1.0);

  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float t = fract(
      uTime * 0.05
    + atan(p.y, p.x) / 6.28318530718 * 0.6
    + length(p) * 0.55
    + motion * 0.2
  );

  // Fully gated on motion: a still room paints nothing at all.
  float mk = motion * motion;
  float amount = uInk * mk + uEdgeInk * edge;
  vec3 ink = palette(t) * amount * (0.7 + 0.9 * uEnergy);

  // Ink is scaled by the decay so the feedback loop settles at a stable exposure.
  gl_FragColor = vec4(min(prev + ink * (1.0 - uDecayStep), vec3(3.0)), 1.0);
}
`;

// Full-resolution outline. The motion field is deliberately low-res and smeary;
// the figure needs its own sharp pass or it dissolves on a big screen.
// r = outline gated by movement, g = raw edge, b = movement mask.
export const bodyFrag = /* glsl */ `
precision highp float;

uniform sampler2D uVideo;
uniform sampler2D uMotion;
uniform vec2 uTexel;
uniform vec2 uCoverScale;
uniform float uEdgeGain;
uniform float uThresh;
uniform float uSoft;
uniform float uHasVideo;
varying vec2 vUv;

float lum(vec2 uv){
  vec2 t = (uv - 0.5) * uCoverScale + 0.5;
  t.x = 1.0 - t.x;
  return dot(texture2D(uVideo, clamp(t, 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
}

void main(){
  vec2 e = uTexel * 1.5;
  float l  = lum(vUv - vec2(e.x, 0.0));
  float r  = lum(vUv + vec2(e.x, 0.0));
  float d  = lum(vUv - vec2(0.0, e.y));
  float u  = lum(vUv + vec2(0.0, e.y));
  float dl = lum(vUv - e);
  float dr = lum(vUv + vec2(e.x, -e.y));
  float ul = lum(vUv + vec2(-e.x, e.y));
  float ur = lum(vUv + e);

  vec2 sobel = vec2(
    (ur + 2.0 * r + dr) - (ul + 2.0 * l + dl),
    (ul + 2.0 * u + ur) - (dl + 2.0 * d + dr)
  );
  float raw = length(sobel) * uEdgeGain;
  float outline = smoothstep(uThresh, uThresh + uSoft, raw);

  float mask = smoothstep(0.06, 0.40, texture2D(uMotion, vUv).g);
  if (uHasVideo < 0.5) mask = texture2D(uMotion, vUv).g;

  gl_FragColor = vec4(outline * mask, outline, mask, 1.0);
}
`;

export const compositeFrag = /* glsl */ `
precision highp float;
uniform sampler2D uField;
uniform sampler2D uMotion;
uniform sampler2D uBodyTex;
uniform float uGlowBase;
uniform float uBody;
uniform float uTime;
uniform float uAspect;
varying vec2 vUv;

${PALETTE}

void main(){
  vec3 col = texture2D(uField, vUv).rgb;
  vec3 bg = mix(vec3(0.008, 0.010, 0.028), vec3(0.030, 0.008, 0.042), vUv.y) * uGlowBase;

  // Unfolded live layer, drawn straight over the feedback so the person always
  // reads clearly no matter what the loop is doing behind them.
  vec3 b = texture2D(uBodyTex, vUv).rgb;
  float outline = b.r;
  float glow = texture2D(uMotion, vUv).g;

  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec3 tint = palette(fract(uTime * 0.06 + length(p) * 0.45 + glow * 0.2));
  vec3 live = (tint * 0.62 + vec3(0.38)) * outline * uBody * 2.0;

  // Knock the feedback back behind the figure so the outline reads against any background.
  col *= 1.0 - 0.72 * clamp(outline * 1.6, 0.0, 1.0) * step(0.01, uBody);

  gl_FragColor = vec4(col + bg + live, 1.0);
}
`;

export const gradeFrag = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uChroma;
uniform float uGrain;
uniform float uSaturation;
uniform float uContrast;
uniform float uTime;
varying vec2 vUv;

${NOISE}

void main(){
  vec2 d = (vUv - 0.5);
  float k = uChroma * dot(d, d);
  vec3 col = vec3(
    texture2D(tDiffuse, vUv - d * k).r,
    texture2D(tDiffuse, vUv).g,
    texture2D(tDiffuse, vUv + d * k).b
  );
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturation);
  // Gamma-style: adds contrast without crushing a dark frame to pure black.
  col = pow(max(col, vec3(0.0)), vec3(uContrast));

  col += (hash21(vUv * 1024.0 + fract(uTime) * 91.0) - 0.5) * uGrain * (0.15 + dot(col, vec3(0.33)));
  gl_FragColor = vec4(col, 1.0);
}
`;

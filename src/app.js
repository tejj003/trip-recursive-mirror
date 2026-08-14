import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as S from './shaders.js';

const qs = new URLSearchParams(location.search);
const qsNum = (key, fallback) => {
  const v = parseFloat(qs.get(key));
  return Number.isFinite(v) ? v : fallback;
};
const MAX_DPR = qsNum('dpr', 1.25);
const MAX_PIXELS = qsNum('maxpixels', 3.2e6);
const NO_CAM = qs.has('nocam');

const PALETTES = [
  { name: 'Prism', a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1.0, 1.0, 1.0], d: [0.0, 0.33, 0.67] },
  { name: 'Acid', a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1.0, 1.0, 0.5], d: [0.8, 0.9, 0.3] },
  { name: 'Vapour', a: [0.66, 0.56, 0.68], b: [0.72, 0.44, 0.72], c: [0.52, 0.80, 0.52], d: [-0.43, -0.40, -0.08] },
  { name: 'Ultraviolet', a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [2.0, 1.0, 0.0], d: [0.5, 0.20, 0.25] },
  { name: 'Solar', a: [0.8, 0.5, 0.4], b: [0.3, 0.4, 0.2], c: [2.0, 1.0, 1.0], d: [0.0, 0.25, 0.25] },
];

// Each mode is a destination the live parameters ease toward.
// Zoom is negative everywhere: the tunnel expands outward, so feedback energy
// drains off the edges instead of piling into the centre.
const MODES = [
  { name: 'Tunnel',  fold: 0,  rot: 0.10, zoom: -0.22, warp: 0.10, hue: 0.22, decay: 0.984, chroma: 0.0035 },
  { name: 'Kaleido', fold: 8,  rot: 0.16, zoom: -0.16, warp: 0.06, hue: 0.30, decay: 0.976, chroma: 0.0028 },
  { name: 'Spiral',  fold: 6,  rot: 0.70, zoom: -0.26, warp: 0.14, hue: 0.40, decay: 0.978, chroma: 0.0050 },
  { name: 'Melt',    fold: 0,  rot: 0.02, zoom: -0.06, warp: 0.55, hue: 0.16, decay: 0.986, chroma: 0.0020 },
  { name: 'Bloom',   fold: 12, rot: -0.30, zoom: -0.20, warp: 0.09, hue: 0.34, decay: 0.962, chroma: 0.0042 },
];

const DEFAULTS = {
  ink: 1.8,
  edgeInk: 1.0,
  body: 1.6,
  edgeGain: 2.6,
  edgeThresh: 0.16,
  sharpen: 0.35,
  stillness: 0.05,
  presence: 3.5,
  hold: 2.5,
  bloom: 0.7,
  exposure: 1.0,
  saturation: 1.35,
  contrast: 1.2,
  postChroma: 0.35,
  grain: 0.022,
  glowBase: 0.3,
};

const P = { ...DEFAULTS };
try {
  Object.assign(P, JSON.parse(localStorage.getItem('alter.params') || '{}'));
} catch { /* ignore corrupt storage */ }

const canvas = document.getElementById('stage');
const video = document.getElementById('cam');
const hud = document.getElementById('hud');
const statusEl = document.getElementById('status');
const gate = document.getElementById('gate');
const gateMsg = document.getElementById('gate-msg');
const modeEl = document.getElementById('mode-name');
const paletteEl = document.getElementById('palette-name');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.autoClear = false;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = P.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadGeo = new THREE.PlaneGeometry(2, 2);

let width = 1;
let height = 1;
let dpr = 1;
let flowW = 256;
let flowH = 256;

/* ---------------------------------------------------------------- camera */

const blankTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
blankTex.needsUpdate = true;

let stream = null;
let camState = 'idle';

async function startCamera() {
  if (NO_CAM) {
    camState = 'off';
    return false;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    camState = 'unsupported';
    return false;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    });
    video.srcObject = stream;
    await video.play();
    const tex = new THREE.VideoTexture(video);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    motionMat.uniforms.uVideo.value = tex;
    bodyMat.uniforms.uVideo.value = tex;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      camState = 'lost';
      setTimeout(startCamera, 2000);
    });
    camState = 'live';
    gate.classList.add('hidden');
    updateCover();
    return true;
  } catch (err) {
    camState = err?.name === 'NotAllowedError' ? 'denied' : 'error';
    gateMsg.textContent =
      camState === 'denied'
        ? 'Camera access is blocked. Allow it in the browser, then click to retry.'
        : `Camera unavailable (${err?.name || 'error'}). Click to retry.`;
    gate.classList.remove('hidden');
    return false;
  }
}

function updateCover() {
  const va = (video.videoWidth || 16) / (video.videoHeight || 9);
  const da = width / height;
  const sx = va > da ? da / va : 1;
  const sy = va > da ? 1 : va / da;
  motionMat.uniforms.uCoverScale.value.set(sx, sy);
  bodyMat.uniforms.uCoverScale.value.set(sx, sy);
}

// Overall movement in the room, measured off a tiny 2D copy of the frame.
const probe = document.createElement('canvas');
probe.width = 32;
probe.height = 24;
const probeCtx = probe.getContext('2d', { willReadFrequently: true });
let probePrev = null;
let energy = 0;
let meanLum = 0;
let globalShift = 0;

function sampleEnergy() {
  if (camState !== 'live' || video.readyState < 2) {
    energy = 0.35 + 0.25 * Math.sin(performance.now() * 0.0005);
    globalShift = 0;
    return;
  }
  probeCtx.drawImage(video, 0, 0, 32, 24);
  const data = probeCtx.getImageData(0, 0, 32, 24).data;
  let lum = 0;
  for (let i = 0; i < data.length; i += 4) {
    lum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  lum /= (32 * 24 * 255);

  if (probePrev) {
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += Math.abs(data[i] - probePrev[i]);
    energy += (Math.min(1, sum / (32 * 24 * 26)) - energy) * 0.35;
    globalShift = lum - meanLum;
  }
  meanLum = lum;
  probePrev = data;
}

/* ------------------------------------------------------------ motion pass */

const motionMat = new THREE.ShaderMaterial({
  vertexShader: S.fullscreenVert,
  fragmentShader: S.motionFrag,
  depthTest: false,
  depthWrite: false,
  uniforms: {
    uVideo: { value: blankTex },
    uPrev: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 256, 1 / 256) },
    uCoverScale: { value: new THREE.Vector2(1, 1) },
    uDecay: { value: 0.9 },
    uHasVideo: { value: 0 },
    uGlobalShift: { value: 0 },
    uTime: { value: 0 },
  },
});
const motionScene = new THREE.Scene();
motionScene.add(new THREE.Mesh(quadGeo, motionMat));

const rtOpts = {
  type: THREE.HalfFloatType,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: false,
  stencilBuffer: false,
};
const motionRT = [new THREE.WebGLRenderTarget(1, 1, rtOpts), new THREE.WebGLRenderTarget(1, 1, rtOpts)];
let motionIndex = 0;

/* -------------------------------------------------------------- body pass */

const bodyMat = new THREE.ShaderMaterial({
  vertexShader: S.fullscreenVert,
  fragmentShader: S.bodyFrag,
  depthTest: false,
  depthWrite: false,
  blending: THREE.NoBlending,
  uniforms: {
    uVideo: { value: blankTex },
    uMotion: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uCoverScale: { value: new THREE.Vector2(1, 1) },
    uEdgeGain: { value: P.edgeGain },
    uThresh: { value: P.edgeThresh },
    uSoft: { value: 0.18 },
    uHasVideo: { value: 0 },
  },
});
const bodyScene = new THREE.Scene();
bodyScene.add(new THREE.Mesh(quadGeo, bodyMat));
const bodyRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);

/* ---------------------------------------------------------- feedback pass */

const palUniforms = () => ({
  uPalA: { value: new THREE.Vector3() },
  uPalB: { value: new THREE.Vector3() },
  uPalC: { value: new THREE.Vector3() },
  uPalD: { value: new THREE.Vector3() },
});

const feedbackMat = new THREE.ShaderMaterial({
  vertexShader: S.fullscreenVert,
  fragmentShader: S.feedbackFrag,
  depthTest: false,
  depthWrite: false,
  blending: THREE.NoBlending,
  uniforms: {
    uPrev: { value: null },
    uMotion: { value: null },
    uBodyTex: { value: null },
    uAspect: { value: 1 },
    uTime: { value: 0 },
    uFold: { value: 0 },
    uRotStep: { value: 0 },
    uZoomStep: { value: 1 },
    uWarpStep: { value: 0 },
    uHueStep: { value: 0 },
    uDecayStep: { value: 0.97 },
    uChroma: { value: 0.003 },
    uInk: { value: P.ink },
    uEdgeInk: { value: P.edgeInk },
    uEnergy: { value: 0 },
    uSharp: { value: P.sharpen },
    uFloor: { value: 0.0035 },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    ...palUniforms(),
  },
});
const feedbackScene = new THREE.Scene();
feedbackScene.add(new THREE.Mesh(quadGeo, feedbackMat));

const fieldOpts = {
  ...rtOpts,
  wrapS: THREE.MirroredRepeatWrapping,
  wrapT: THREE.MirroredRepeatWrapping,
};
const fieldRT = [new THREE.WebGLRenderTarget(1, 1, fieldOpts), new THREE.WebGLRenderTarget(1, 1, fieldOpts)];
let fieldIndex = 0;

/* -------------------------------------------------------------- composite */

const compositeMat = new THREE.ShaderMaterial({
  vertexShader: S.fullscreenVert,
  fragmentShader: S.compositeFrag,
  depthTest: false,
  depthWrite: false,
  uniforms: {
    uField: { value: null },
    uMotion: { value: null },
    uBodyTex: { value: null },
    uGlowBase: { value: P.glowBase },
    uBody: { value: P.body },
    uAspect: { value: 1 },
    uTime: { value: 0 },
    ...palUniforms(),
  },
});
const compositeScene = new THREE.Scene();
compositeScene.add(new THREE.Mesh(quadGeo, compositeMat));

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(compositeScene, quadCam));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), P.bloom, 0.55, 0.5);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uChroma: { value: P.postChroma },
    uGrain: { value: P.grain },
    uSaturation: { value: P.saturation },
    uContrast: { value: P.contrast },
    uTime: { value: 0 },
  },
  vertexShader: S.fullscreenVert,
  fragmentShader: S.gradeFrag,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

/* ------------------------------------------------------------------ sizing */

function resize() {
  width = Math.max(1, window.innerWidth);
  height = Math.max(1, window.innerHeight);

  dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const budget = Math.sqrt(MAX_PIXELS / (width * height));
  if (budget < dpr) dpr = Math.max(0.5, budget);

  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(dpr);
  composer.setSize(width, height);
  bloom.setSize(width * dpr, height * dpr);

  const aspect = width / height;
  flowW = aspect >= 1 ? 256 : Math.max(64, Math.round(256 * aspect));
  flowH = aspect >= 1 ? Math.max(64, Math.round(256 / aspect)) : 256;
  motionRT.forEach((rt) => rt.setSize(flowW, flowH));
  motionMat.uniforms.uTexel.value.set(1 / flowW, 1 / flowH);

  fieldRT.forEach((rt) => rt.setSize(Math.round(width * dpr), Math.round(height * dpr)));
  bodyRT.setSize(Math.round(width * dpr), Math.round(height * dpr));
  bodyMat.uniforms.uTexel.value.set(1 / (width * dpr), 1 / (height * dpr));
  feedbackMat.uniforms.uAspect.value = aspect;
  compositeMat.uniforms.uAspect.value = aspect;
  feedbackMat.uniforms.uTexel.value.set(1 / (width * dpr), 1 / (height * dpr));

  updateCover();
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------------- state */

const live = { ...MODES[0] };
let modeIndex = 0;
let paletteIndex = 0;
let autoCycle = true;
let nextSwitch = 40;

const tmpVec = new THREE.Vector3();
const pal = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };
{
  const p = PALETTES[0];
  pal.a.fromArray(p.a); pal.b.fromArray(p.b); pal.c.fromArray(p.c); pal.d.fromArray(p.d);
}

function setMode(i) {
  modeIndex = ((i % MODES.length) + MODES.length) % MODES.length;
  modeEl.textContent = MODES[modeIndex].name;
}
function setPalette(i) {
  paletteIndex = ((i % PALETTES.length) + PALETTES.length) % PALETTES.length;
  paletteEl.textContent = PALETTES[paletteIndex].name;
}
setMode(0);
setPalette(0);

const clock = new THREE.Clock();
const FIELD_STEP = 1 / 60;
let stepAcc = 0;
let drive = 0;
let frames = 0;
let fpsTime = 0;
let fps = 0;
let probeTick = 0;

function frame() {
  requestAnimationFrame(frame);

  const dt = Math.min(clock.getDelta(), 1 / 20);
  const time = clock.elapsedTime;

  if (++probeTick % 3 === 0) sampleEnergy();
  if (autoCycle && time > nextSwitch) {
    nextSwitch = time + 40;
    setMode(modeIndex + 1);
    if (modeIndex === 0) setPalette(paletteIndex + 1);
  }

  // Ease every parameter toward the current mode, framerate independent.
  const target = MODES[modeIndex];
  const k = 1 - Math.exp(-0.8 * dt);
  for (const key of ['fold', 'rot', 'zoom', 'warp', 'hue', 'decay', 'chroma']) {
    live[key] += (target[key] - live[key]) * k;
  }
  const pk = 1 - Math.exp(-1.6 * dt);
  const cp = PALETTES[paletteIndex];
  pal.a.lerp(tmpVec.fromArray(cp.a), pk);
  pal.b.lerp(tmpVec.fromArray(cp.b), pk);
  pal.c.lerp(tmpVec.fromArray(cp.c), pk);
  pal.d.lerp(tmpVec.fromArray(cp.d), pk);

  // Presence gate: snaps up when someone arrives, releases slowly when they leave.
  // At drive 0 the warp is the identity transform, so the field holds still and sharp.
  const wanted = Math.min(1, energy * P.presence);
  const rate = wanted > drive ? 6.0 : 1 / Math.max(0.2, P.hold);
  drive += (wanted - drive) * (1 - Math.exp(-rate * dt));
  const gate = P.stillness + (1 - P.stillness) * drive;
  // 1. motion + edges from the camera
  const hasVideo = camState === 'live' && video.readyState >= 2;
  motionMat.uniforms.uHasVideo.value = hasVideo ? 1 : 0;
  motionMat.uniforms.uTime.value = time;
  motionMat.uniforms.uDecay.value = Math.pow(0.88, dt * 60);
  motionMat.uniforms.uGlobalShift.value = globalShift;
  motionMat.uniforms.uPrev.value = motionRT[motionIndex].texture;
  motionIndex = 1 - motionIndex;
  renderer.setRenderTarget(motionRT[motionIndex]);
  renderer.render(motionScene, quadCam);

  // 1b. sharp outline at full resolution
  bodyMat.uniforms.uMotion.value = motionRT[motionIndex].texture;
  bodyMat.uniforms.uHasVideo.value = hasVideo ? 1 : 0;
  bodyMat.uniforms.uEdgeGain.value = P.edgeGain;
  bodyMat.uniforms.uThresh.value = P.edgeThresh;
  renderer.setRenderTarget(bodyRT);
  renderer.render(bodyScene, quadCam);

  // 2. fold, spin, zoom, hue-shift and re-ink the feedback buffer
  // Stepped at a fixed rate: every resample blurs, so a 120Hz display must not
  // iterate the loop twice as often as a 60Hz one.
  stepAcc += dt;
  if (stepAcc >= FIELD_STEP) {
    const sdt = Math.min(stepAcc, 1 / 20);
    stepAcc = 0;
    const fu = feedbackMat.uniforms;
    fu.uPrev.value = fieldRT[fieldIndex].texture;
    fu.uMotion.value = motionRT[motionIndex].texture;
    fu.uBodyTex.value = bodyRT.texture;
    fu.uTime.value = time;
    fu.uFold.value = live.fold;
    fu.uRotStep.value = live.rot * gate * sdt;
    fu.uZoomStep.value = Math.exp(live.zoom * gate * sdt);
    fu.uWarpStep.value = live.warp * gate * sdt;
    fu.uHueStep.value = live.hue * gate * sdt;
    // Idle frames fade quickly, so an empty room returns to a clean, still screen.
    fu.uDecayStep.value = Math.pow(THREE.MathUtils.lerp(0.988, live.decay, drive), sdt * 60);
    fu.uChroma.value = live.chroma;
    // The first motion frame has no previous frame to compare against and reads
    // as full-screen movement, so hold the ink back until the buffer is primed.
    const primed = time > 0.5 ? 1 : 0;
    fu.uInk.value = P.ink * primed;
    fu.uEdgeInk.value = P.edgeInk * primed;
    fu.uSharp.value = P.sharpen;
    fu.uEnergy.value = energy;
    fu.uPalA.value.copy(pal.a);
    fu.uPalB.value.copy(pal.b);
    fu.uPalC.value.copy(pal.c);
    fu.uPalD.value.copy(pal.d);
    fieldIndex = 1 - fieldIndex;
    renderer.setRenderTarget(fieldRT[fieldIndex]);
    renderer.render(feedbackScene, quadCam);
  }

  // 3. grade and bloom to screen
  compositeMat.uniforms.uField.value = fieldRT[fieldIndex].texture;
  compositeMat.uniforms.uMotion.value = motionRT[motionIndex].texture;
  compositeMat.uniforms.uBodyTex.value = bodyRT.texture;
  compositeMat.uniforms.uGlowBase.value = P.glowBase;
  compositeMat.uniforms.uBody.value = P.body;
  compositeMat.uniforms.uTime.value = time;
  compositeMat.uniforms.uPalA.value.copy(pal.a);
  compositeMat.uniforms.uPalB.value.copy(pal.b);
  compositeMat.uniforms.uPalC.value.copy(pal.c);
  compositeMat.uniforms.uPalD.value.copy(pal.d);
  bloom.strength = P.bloom;
  grade.uniforms.uChroma.value = P.postChroma;
  grade.uniforms.uGrain.value = P.grain;
  grade.uniforms.uSaturation.value = P.saturation;
  grade.uniforms.uContrast.value = P.contrast;
  grade.uniforms.uTime.value = time;
  renderer.toneMappingExposure = P.exposure;
  renderer.setRenderTarget(null);
  composer.render();

  frames++;
  if (time - fpsTime > 0.5) {
    fps = Math.round(frames / (time - fpsTime));
    frames = 0;
    fpsTime = time;
    if (!hud.classList.contains('hidden')) {
      statusEl.textContent = `${fps} fps · ${width}×${height} @${dpr.toFixed(2)} · energy ${energy.toFixed(2)} · drive ${drive.toFixed(2)} · camera: ${camState}`;
    }
  }
}
requestAnimationFrame(frame);

/* --------------------------------------------------------------- controls */

const sliders = document.querySelectorAll('#hud input[type=range]');
sliders.forEach((el) => {
  const key = el.dataset.param;
  el.value = P[key];
  const label = el.parentElement.querySelector('span');
  const paint = () => { label.textContent = Number(el.value).toFixed(2); };
  paint();
  el.addEventListener('input', () => {
    P[key] = parseFloat(el.value);
    paint();
    try { localStorage.setItem('alter.params', JSON.stringify(P)); } catch { /* ignore */ }
  });
});

document.getElementById('reset').addEventListener('click', () => {
  Object.assign(P, DEFAULTS);
  sliders.forEach((el) => {
    el.value = P[el.dataset.param];
    el.dispatchEvent(new Event('input'));
  });
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'h') hud.classList.toggle('hidden');
  else if (k === 'm') { setMode(modeIndex + 1); nextSwitch = clock.elapsedTime + 40; }
  else if (k === 'p') setPalette(paletteIndex + 1);
  else if (k === 'a') autoCycle = !autoCycle;
  else if (k === 't') {
    document.getElementById('title').classList.toggle('hidden');
    document.getElementById('signature').classList.toggle('hidden');
  }
  else if (k === 'c') video.classList.toggle('visible');
  else if (k === 'r') startCamera();
  else if (k === 'f') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }
});

gate.addEventListener('click', startCamera);
window.addEventListener('dblclick', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});

let idleTimer;
window.addEventListener('pointermove', () => {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 3000);
});

let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* ignore */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    keepAwake();
    if (camState !== 'live') startCamera();
  }
});
keepAwake();

video.addEventListener('loadedmetadata', updateCover);
startCamera();

window.TRIP = {
  P, MODES, setMode, setPalette, feedbackMat, motionMat,
  get drive() { return drive; },
  get energy() { return energy; },
  get fps() { return fps; },
  get camState() { return camState; },
};

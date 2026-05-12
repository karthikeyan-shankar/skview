import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';

// --- Galaxy Shader Engine ---
const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;
uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform bool uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;
uniform float uAutoCenterRepulsion;
uniform bool uTransparent;
varying vec2 vUv;

#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) { return abs(fract(x) * 2.0 - 1.0); }
float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}
float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float Star(vec2 uv, float flare, float glow) {
  float d = length(uv);
  float m = (0.05 * glow) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * glow;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * glow;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv, float time, float speed, float twinkleInt, float hueShift, float saturation, float glow) {
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5; 
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + offset;
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(time * 0.1 / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);
      
      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + hueShift / 360.0);
      float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * saturation;
      float val = max(max(base.r, base.g), base.b);
      base = hsv2rgb(vec3(hue, sat, val));

      vec2 pad = vec2(tris(seed * 34.0 + time * speed / 10.0), tris(seed * 38.0 + time * speed / 30.0)) - 0.5;
      float star = Star(gv - offset - pad, flareSize, glow);
      float twinkle = trisn(time * speed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, twinkleInt);
      col += star * size * base * twinkle;
    }
  }
  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;
  vec2 mouseNorm = uMouse - vec2(0.5);
  
  if (uMouseRepulsion) {
    vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
    float mouseDist = length(uv - mousePosUV);
    vec2 repulsion = normalize(uv - mousePosUV) * (uRepulsionStrength / (mouseDist + 0.1));
    uv += repulsion * 0.05 * uMouseActiveFactor;
  }

  float autoRotAngle = uTime * uRotationSpeed;
  mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
  uv = autoRot * uv;
  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);
  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32, uTime, uSpeed, uTwinkleIntensity, uHueShift, uSaturation, uGlowIntensity) * fade;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

function initGalaxy() {
  const ctn = document.getElementById('galaxy-bg');
  if (!ctn) return;

  const renderer = new Renderer({ alpha: false });
  const gl = renderer.gl;
  ctn.appendChild(gl.canvas);

  const targetMousePos = { x: 0.5, y: 0.5 };
  const smoothMousePos = { x: 0.5, y: 0.5 };
  let mouseActive = 0.0;
  let smoothMouseActive = 0.0;

  function resize() {
    renderer.setSize(ctn.offsetWidth, ctn.offsetHeight);
    program.uniforms.uResolution.value = new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height);
  }
  window.addEventListener('resize', resize);

  const geometry = new Triangle(gl);
  const program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height) },
      uFocal: { value: new Float32Array([0.5, 0.5]) },
      uRotation: { value: new Float32Array([1.0, 0.0]) },
      uStarSpeed: { value: 0.5 },
      uDensity: { value: 1.5 },
      uHueShift: { value: 210 },
      uSpeed: { value: 0.8 },
      uMouse: { value: new Float32Array([0.5, 0.5]) },
      uGlowIntensity: { value: 0.8 },
      uSaturation: { value: 0.5 },
      uMouseRepulsion: { value: true },
      uTwinkleIntensity: { value: 0.5 },
      uRotationSpeed: { value: 0.05 },
      uRepulsionStrength: { value: 2.5 },
      uMouseActiveFactor: { value: 0.0 },
      uAutoCenterRepulsion: { value: 0 },
      uTransparent: { value: false }
    }
  });

  const mesh = new Mesh(gl, { geometry, program });
  resize();

  function update(t) {
    requestAnimationFrame(update);
    program.uniforms.uTime.value = t * 0.001;
    program.uniforms.uStarSpeed.value = (t * 0.001 * 0.5) / 10.0;

    const lerp = 0.05;
    smoothMousePos.x += (targetMousePos.x - smoothMousePos.x) * lerp;
    smoothMousePos.y += (targetMousePos.y - smoothMousePos.y) * lerp;
    smoothMouseActive += (mouseActive - smoothMouseActive) * lerp;

    program.uniforms.uMouse.value[0] = smoothMousePos.x;
    program.uniforms.uMouse.value[1] = smoothMousePos.y;
    program.uniforms.uMouseActiveFactor.value = smoothMouseActive;

    renderer.render({ scene: mesh });
  }
  requestAnimationFrame(update);

  window.addEventListener('mousemove', (e) => {
    targetMousePos.x = e.clientX / window.innerWidth;
    targetMousePos.y = 1.0 - (e.clientY / window.innerHeight);
    mouseActive = 1.0;
  });
}

// --- Initialize App ---
let hunterActive = false;

document.addEventListener('DOMContentLoaded', () => {
  initGalaxy();
  initStats();
  
  // Border Glow Logic
  const card = document.querySelector('.glass-card');
  if (card) {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  }
});

async function initStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    const counterEl = document.getElementById('visitCounter');
    if (counterEl) counterEl.textContent = data.count.toLocaleString();
  } catch {}
}

window.startRedirect = function() {
  const overlay = document.getElementById('loadingOverlay');
  const status = document.getElementById('statusText');
  overlay.style.display = 'flex';

  const steps = ["SECURING CONNECTION...", "BYPASSING CONGESTION...", "ESTABLISHING HANDSHAKE...", "FINALIZING TUNNEL..."];
  let currentStep = 0;
  const interval = setInterval(() => {
    currentStep++;
    if (currentStep < steps.length) {
      status.textContent = steps[currentStep];
    } else {
      clearInterval(interval);
      window.location.href = "/entry";
    }
  }, 800);
};

window.toggleHunter = function() {
  hunterActive = !hunterActive;
  const btn = document.getElementById('hunterBtn');
  if (hunterActive) {
    btn.textContent = "WAITING FOR SERVER...";
    btn.style.color = "#ff4d4d";
    btn.style.borderColor = "#ff4d4d";
    startHunting();
  } else {
    btn.textContent = "USE HUNTER MODE";
    btn.style.color = "#fff";
    btn.style.borderColor = "rgba(255,255,255,0.15)";
  }
};

function startHunting() {
  if (!hunterActive) return;
  fetch('/api/ping').then(r => r.json()).then(d => {
    if (d.status === 'online') window.startRedirect();
    else setTimeout(startHunting, 2000);
  }).catch(() => setTimeout(startHunting, 2000));
}

import { Renderer, Triangle, Program, Mesh } from 'ogl';

// --- Prism Raymarching Shaders ---
const vertexShader = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform vec2  iResolution;
  uniform float iTime;
  uniform float uHeight;
  uniform float uBaseHalf;
  uniform mat3  uRot;
  uniform int   uUseBaseWobble;
  uniform float uGlow;
  uniform vec2  uOffsetPx;
  uniform float uNoise;
  uniform float uSaturation;
  uniform float uScale;
  uniform float uHueShift;
  uniform float uColorFreq;
  uniform float uBloom;
  uniform float uCenterShift;
  uniform float uInvBaseHalf;
  uniform float uInvHeight;
  uniform float uMinAxis;
  uniform float uPxScale;
  uniform float uTimeScale;

  vec4 tanh4(vec4 x){
    vec4 e2x = exp(2.0*x);
    return (e2x - 1.0) / (e2x + 1.0);
  }

  float rand(vec2 co){
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  float sdOctaAnisoInv(vec3 p){
    vec3 q = vec3(abs(p.x) * uInvBaseHalf, abs(p.y) * uInvHeight, abs(p.z) * uInvBaseHalf);
    float m = q.x + q.y + q.z - 1.0;
    return m * uMinAxis * 0.5773502691896258;
  }

  float sdPyramidUpInv(vec3 p){
    float oct = sdOctaAnisoInv(p);
    float halfSpace = -p.y;
    return max(oct, halfSpace);
  }

  void main(){
    vec2 f = (gl_FragCoord.xy - 0.5 * iResolution.xy - uOffsetPx) * uPxScale;
    float z = 5.0;
    float d = 0.0;
    vec3 p;
    vec4 o = vec4(0.0);
    float centerShift = uCenterShift;
    float cf = uColorFreq;

    float t = iTime * uTimeScale;
    float c0 = cos(t + 0.0);
    float c1 = cos(t + 33.0);
    float c2 = cos(t + 11.0);
    mat2 wob = mat2(c0, c1, c2, c0);

    const int STEPS = 100;
    for (int i = 0; i < STEPS; i++) {
      p = vec3(f, z);
      p.xz = p.xz * wob;
      p = uRot * p;
      vec3 q = p;
      q.y += centerShift;
      d = 0.1 + 0.2 * abs(sdPyramidUpInv(q));
      z -= d;
      o += (sin((p.y + z) * cf + vec4(0.0, 1.0, 2.0, 3.0)) + 1.0) / d;
    }

    o = tanh4(o * o * (uGlow * uBloom) / 1e5);
    vec3 col = o.rgb;
    float n = rand(gl_FragCoord.xy + vec2(iTime));
    col += (n - 0.5) * uNoise;
    col = clamp(col, 0.0, 1.0);
    float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = clamp(mix(vec3(L), col, uSaturation), 0.0, 1.0);
    gl_FragColor = vec4(col, o.a);
  }
`;

function initPrism() {
  const ctn = document.getElementById('prism-bg');
  if (!ctn) return;

  const renderer = new Renderer({ dpr: Math.min(2, window.devicePixelRatio), alpha: true });
  const gl = renderer.gl;
  ctn.appendChild(gl.canvas);

  const geometry = new Triangle(gl);
  const H = 3.5;
  const BW = 5.5;
  const SCALE = 3.6;
  const TS = 0.4;

  const program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      iResolution: { value: new Float32Array([gl.drawingBufferWidth, gl.drawingBufferHeight]) },
      iTime: { value: 0 },
      uHeight: { value: H },
      uBaseHalf: { value: BW * 0.5 },
      uRot: { value: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) },
      uGlow: { value: 1.0 },
      uOffsetPx: { value: new Float32Array([0, 0]) },
      uNoise: { value: 0.01 },
      uSaturation: { value: 1.5 },
      uScale: { value: SCALE },
      uHueShift: { value: 0 },
      uColorFreq: { value: 1.0 },
      uBloom: { value: 1.0 },
      uCenterShift: { value: H * 0.25 },
      uInvBaseHalf: { value: 1 / (BW * 0.5) },
      uInvHeight: { value: 1 / H },
      uMinAxis: { value: Math.min(BW * 0.5, H) },
      uPxScale: { value: 1 / (gl.drawingBufferHeight * 0.1 * SCALE) },
      uTimeScale: { value: TS }
    }
  });

  const mesh = new Mesh(gl, { geometry, program });

  function resize() {
    renderer.setSize(ctn.clientWidth, ctn.clientHeight);
    program.uniforms.iResolution.value[0] = gl.drawingBufferWidth;
    program.uniforms.iResolution.value[1] = gl.drawingBufferHeight;
    program.uniforms.uPxScale.value = 1 / (gl.drawingBufferHeight * 0.1 * SCALE);
  }
  window.addEventListener('resize', resize);
  resize();

  function update(t) {
    requestAnimationFrame(update);
    program.uniforms.iTime.value = t * 0.001;
    renderer.render({ scene: mesh });
  }
  requestAnimationFrame(update);
}

// --- Initialize App ---
let hunterActive = false;

document.addEventListener('DOMContentLoaded', () => {
  initPrism();
  initStats();
  
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
    if (currentStep < steps.length) status.textContent = steps[currentStep];
    else { clearInterval(interval); window.location.href = "/entry"; }
  }, 800);
};

window.toggleHunter = function() {
  hunterActive = !hunterActive;
  const btn = document.getElementById('hunterBtn');
  if (hunterActive) {
    btn.textContent = "WAITING FOR SERVER...";
    btn.style.color = "#ff4d4d"; btn.style.borderColor = "#ff4d4d";
    startHunting();
  } else {
    btn.textContent = "USE HUNTER MODE";
    btn.style.color = "#fff"; btn.style.borderColor = "rgba(255,255,255,0.15)";
  }
};

function startHunting() {
  if (!hunterActive) return;
  fetch('/api/ping').then(r => r.json()).then(d => {
    if (d.status === 'online') window.startRedirect();
    else setTimeout(startHunting, 2000);
  }).catch(() => setTimeout(startHunting, 2000));
}

import * as THREE from 'three';

const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;
void main() {
  vPosition = position;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
varying vec3 vPosition;
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uNoiseIntensity;
uniform vec3 uColor;
uniform float uRotation;

#define PI 3.14159265359

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main() {
  vec2 uv = vUv;
  float angle = uRotation * PI / 180.0;
  float s = sin(angle);
  float c = cos(angle);
  uv = vec2(c * (uv.x - 0.5) - s * (uv.y - 0.5) + 0.5, s * (uv.x - 0.5) + c * (uv.y - 0.5) + 0.5);

  float rnd = random(uv);
  vec2  tex        = uv * uScale;
  float tOffset    = uSpeed * uTime;

  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

  float pattern = 0.6 +
                  0.4 * sin(5.0 * (tex.x + tex.y +
                                   cos(3.0 * tex.x + 5.0 * tex.y) +
                                   0.02 * tOffset) +
                           sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

  vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
  col.a = 1.0;
  gl_FragColor = col;
}
`;

function initSilk() {
  const ctn = document.getElementById('silk-bg');
  if (!ctn) return;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(ctn.clientWidth, ctn.clientHeight);
  ctn.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 100);
  camera.position.z = 1;

  const uniforms = {
    uSpeed: { value: 5.0 },
    uScale: { value: 1.0 },
    uNoiseIntensity: { value: 1.5 },
    uColor: { value: new THREE.Color("#5227FF") },
    uRotation: { value: 0.0 },
    uTime: { value: 0 }
  };

  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  function resize() {
    renderer.setSize(ctn.clientWidth, ctn.clientHeight);
  }
  window.addEventListener('resize', resize);

  const clock = new THREE.Clock();
  function update() {
    requestAnimationFrame(update);
    uniforms.uTime.value += clock.getDelta() * 0.1;
    renderer.render(scene, camera);
  }
  update();
}

// --- Initialize App ---
let hunterActive = false;

const COLLEGE_PORTAL_URL = 'https://www.chettinadtech.ac.in/intranet/OnlinePortal';

document.addEventListener('DOMContentLoaded', () => {
  initSilk();
  initStats();
  
  // Mouse glow tracking on gateway cards
  document.querySelectorAll('.gateway-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      card.style.setProperty('--my', `${e.clientY - rect.top}px`);
    });
  });
});

async function initStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    const counterEl = document.getElementById('visitCounter');
    if (counterEl) counterEl.textContent = data.count.toLocaleString();
  } catch {}
}

// ─── Loading Animation Helper ────────────────────────────────
function showLoading(title, steps, destination) {
  const overlay = document.getElementById('loadingOverlay');
  const status = document.getElementById('statusText');
  const loadingTitle = document.getElementById('loadingTitle');
  overlay.style.display = 'flex';
  loadingTitle.textContent = title;
  status.textContent = steps[0];
  let i = 0;
  const interval = setInterval(() => {
    i++;
    if (i < steps.length) status.textContent = steps[i];
    else { clearInterval(interval); window.location.href = destination; }
  }, 700);
}

// ─── AU COE Direct Entry ─────────────────────────────────────
window.startRedirect = function() {
  showLoading('SKVIEW TUNNELING', [
    'SECURING CONNECTION...',
    'BYPASSING CONGESTION...',
    'ESTABLISHING HANDSHAKE...',
    'FINALIZING TUNNEL...'
  ], '/entry');
};

// ─── College Portal Direct Entry ─────────────────────────────
window.enterCollege = function() {
  showLoading('COLLEGE PORTAL', [
    'CONNECTING TO CAMPUS SERVER...',
    'LOADING EXAM ENVIRONMENT...',
    'ESTABLISHING SESSION...',
    'ENTERING PORTAL...'
  ], '/college-portal');
};

// ─── Trap Mode (works for both AU and College) ───────────────
window.enterTrap = function(type) {
  const isAU = type === 'au';
  const title = isAU ? 'AU TRAP MODE' : 'EXAM TRAP MODE';
  const dest = isAU ? '/portal' : '/college-portal';
  
  showLoading('🛡️ ' + title, [
    'CAPTURING PORTAL CONTENT...',
    'BUILDING TRAP ENVIRONMENT...',
    'CACHING RESOURCES...',
    'ACTIVATING SHIELD...'
  ], dest);
};

// ─── Hunter Mode (AU only) — High-Power Fast Polling ──────────
let hunterPingCount = 0;

window.toggleHunter = function() {
  hunterActive = !hunterActive;
  const btn = document.getElementById('hunterBtn');
  if (hunterActive) {
    hunterPingCount = 0;
    btn.innerHTML = '⚡ POWER HUNTING... <span style="opacity:0.5;font-size:11px">(0 pings)</span>';
    btn.style.color = '#00ff88'; btn.style.borderColor = '#00ff88';
    btn.style.animation = 'pulse 1s infinite';
    startHunting();
  } else {
    btn.textContent = '⚡ HUNTER MODE';
    btn.style.color = ''; btn.style.borderColor = '';
    btn.style.animation = '';
  }
};

function startHunting() {
  if (!hunterActive) return;
  const btn = document.getElementById('hunterBtn');
  hunterPingCount++;

  fetch('/api/ping').then(r => r.json()).then(d => {
    if (d.status === 'online') {
      btn.innerHTML = '🎯 SERVER OPEN! REDIRECTING...';
      btn.style.color = '#00ff88'; btn.style.borderColor = '#00ff88';
      btn.style.animation = '';
      // Enter Normal COE Mode directly
      window.location.href = '/entry';
    } else {
      btn.innerHTML = `⚡ POWER HUNTING... <span style="opacity:0.5;font-size:11px">(${hunterPingCount} pings)</span>`;
      setTimeout(startHunting, 1000);
    }
  }).catch(() => {
    btn.innerHTML = `⚡ POWER HUNTING... <span style="opacity:0.5;font-size:11px">(${hunterPingCount} pings)</span>`;
    setTimeout(startHunting, 1000);
  });
}


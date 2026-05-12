// --- 3D Cubes Background Engine ---
const GRID_SIZE = 12; // Responsive grid size
const MAX_ANGLE = 45;
const RADIUS = 4;
const CUBE_SIZE = 40; // in px

function initCubes() {
  const ctn = document.getElementById('cubes-bg');
  if (!ctn) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const cols = Math.ceil(width / CUBE_SIZE) + 1;
  const rows = Math.ceil(height / CUBE_SIZE) + 1;

  ctn.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  ctn.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  const cubes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wrapper = document.createElement('div');
      wrapper.className = 'cube-wrapper';
      
      const cube = document.createElement('div');
      cube.className = 'cube';
      cube.dataset.row = r;
      cube.dataset.col = c;

      const faces = ['front', 'back', 'right', 'left', 'top', 'bottom'];
      faces.forEach(face => {
        const div = document.createElement('div');
        div.className = `cube-face cube-face--${face}`;
        cube.appendChild(div);
      });

      wrapper.appendChild(cube);
      ctn.appendChild(wrapper);
      cubes.push(cube);
    }
  }

  let userActive = false;
  let idleTimer = null;

  const tiltAt = (rowCenter, colCenter) => {
    cubes.forEach(cube => {
      const r = +cube.dataset.row;
      const c = +cube.dataset.col;
      const dist = Math.hypot(r - rowCenter, c - colCenter);

      if (dist <= RADIUS) {
        const pct = 1 - dist / RADIUS;
        const angle = pct * MAX_ANGLE;
        gsap.to(cube, {
          duration: 0.3,
          ease: 'power3.out',
          overwrite: true,
          rotateX: -angle,
          rotateY: angle,
          borderColor: `rgba(255, 77, 77, ${0.1 + pct * 0.4})`,
          backgroundColor: `rgba(255, 77, 77, ${pct * 0.1})`
        });
      } else {
        gsap.to(cube, {
          duration: 0.6,
          rotateX: 0,
          rotateY: 0,
          borderColor: 'rgba(255, 77, 77, 0.1)',
          backgroundColor: '#0a0a0a',
          ease: 'power3.out',
          overwrite: true
        });
      }
    });
  };

  window.addEventListener('mousemove', (e) => {
    userActive = true;
    if (idleTimer) clearTimeout(idleTimer);

    const rect = ctn.getBoundingClientRect();
    const cellW = rect.width / cols;
    const cellH = rect.height / rows;
    const colCenter = (e.clientX - rect.left) / cellW;
    const rowCenter = (e.clientY - rect.top) / cellH;

    requestAnimationFrame(() => tiltAt(rowCenter, colCenter));

    idleTimer = setTimeout(() => { userActive = false; }, 3000);
  });

  // Auto-animate loop
  let simPos = { x: cols / 2, y: rows / 2 };
  let simTarget = { x: Math.random() * cols, y: Math.random() * rows };
  
  function loop() {
    if (!userActive) {
      simPos.x += (simTarget.x - simPos.x) * 0.02;
      simPos.y += (simTarget.y - simPos.y) * 0.02;
      tiltAt(simPos.y, simPos.x);
      
      if (Math.hypot(simPos.x - simTarget.x, simPos.y - simTarget.y) < 0.1) {
        simTarget = { x: Math.random() * cols, y: Math.random() * rows };
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
}

// --- Initialize App ---
let hunterActive = false;

document.addEventListener('DOMContentLoaded', () => {
  initCubes();
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

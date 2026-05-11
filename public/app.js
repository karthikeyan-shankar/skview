/* ═══════════════════════════════════════════════════════════════
   SKView — Founder Logic (KK_947)
   ═══════════════════════════════════════════════════════════════ */

let hunterActive = false;

// ─── Stats & Hunter Logic ──────────────────────────────────────
async function init() {
  try {
    // Increment and fetch visit count
    const res = await fetch('/api/stats');
    const data = await res.json();
    const counterEl = document.getElementById('visitCounter');
    if (counterEl) counterEl.textContent = data.count.toLocaleString();
  } catch {}
}

function toggleHunter() {
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
}

function startRedirect() {
  const overlay = document.getElementById('loadingOverlay');
  const status = document.getElementById('statusText');
  
  overlay.style.display = 'flex';
  
  const steps = [
    "SECURING CONNECTION...",
    "BYPASSING CONGESTION...",
    "ESTABLISHING HANDSHAKE...",
    "FINALIZING TUNNEL..."
  ];
  
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
}

function startHunting() {
  if (!hunterActive) return;
  fetch('/api/ping').then(r => r.json()).then(d => {
    if (d.status === 'online') startRedirect(); // Use the new redirect with loading screen
    else setTimeout(startHunting, 2000);
  }).catch(() => setTimeout(startHunting, 2000));
}

init();

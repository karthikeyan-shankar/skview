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

function startHunting() {
  if (!hunterActive) return;
  fetch('/api/ping').then(r => r.json()).then(d => {
    if (d.status === 'online') window.location.href = "/entry";
    else setTimeout(startHunting, 2000);
  }).catch(() => setTimeout(startHunting, 2000));
}

init();

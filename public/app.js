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
    btn.textContent = "HUNTER MODE ON - MONITORING...";
    btn.style.color = "#22c55e";
    btn.style.borderColor = "#22c55e";
    startHunting();
  } else {
    btn.textContent = "START HUNTER MODE";
    btn.style.color = "#fff";
    btn.style.borderColor = "#6366f1";
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

/* ═══════════════════════════════════════════════════════════════
   SKView — Ultra-Mobile Logic
   Achievement: Permanent Entry
   ═══════════════════════════════════════════════════════════════ */

const SERVERS = [
  { id: 'coe', label: 'COE Main Portal', url: 'https://coe.annauniv.edu/home/' },
  { id: 'coe_http', label: 'COE Main (Legacy)', url: 'http://coe.annauniv.edu/home/' },
  { id: 'coe1', label: 'COE Server 1', url: 'https://coe1.annauniv.edu/home/' },
];

let hunterActive = false;
let hunterTimer = null;

async function init() {
  const list = document.getElementById('serverList');
  list.innerHTML = SERVERS.map((s, i) => `
    <div class="server-item">
      <div class="server-item-left">
        <span class="server-label">${s.label}</span>
        <span class="server-status-tag checking" id="tag-${i}">wait</span>
      </div>
      <div class="server-actions">
        <a href="/tunnel/${s.id}/" class="btn-mobile primary">Tunnel Entry</a>
        <a href="${s.url}" target="_blank" class="btn-mobile secondary">Direct ↗</a>
      </div>
    </div>
  `).join('');
  
  runHealthCheck();
}

async function runHealthCheck() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    data.servers.forEach((s, i) => {
      const tag = document.getElementById(`tag-${i}`);
      if (!tag) return;
      tag.className = `server-status-tag ${s.status}`;
      tag.textContent = s.status === 'online' ? `${s.ms}ms` : 'BUSY';
    });
  } catch {}
}

function toggleHunter() {
  hunterActive = !hunterActive;
  const btn = document.getElementById('hunterBtn');
  const card = document.getElementById('hunterCard');
  const sticky = document.getElementById('stickyStatus');
  const stateText = document.getElementById('hunterStateText');
  
  if (hunterActive) {
    btn.textContent = "STOP HUNTER";
    btn.style.background = "var(--red)";
    card.classList.add('active');
    sticky.style.display = "flex";
    stateText.textContent = "HUNTING LIVE WINDOW...";
    startHunting();
  } else {
    btn.textContent = "START WINDOW HUNTER";
    btn.style.background = "var(--primary)";
    card.classList.remove('active');
    sticky.style.display = "none";
    stateText.textContent = "Ready to hunt";
    clearTimeout(hunterTimer);
  }
}

async function startHunting() {
  if (!hunterActive) return;
  const timerText = document.getElementById('hunterTimerText');
  try {
    const res = await fetch(`/api/ping?id=coe`);
    const data = await res.json();
    if (data.status === 'online') {
      // Redirect instantly!
      window.location.href = "/tunnel/coe/";
      return;
    }
  } catch {}
  timerText.textContent = `Last scan: ${new Date().toLocaleTimeString()}`;
  hunterTimer = setTimeout(startHunting, 2000);
}

init();
setInterval(runHealthCheck, 30000);

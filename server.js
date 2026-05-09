const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Unique Visitor Tracking (KK_947) ────────────────────────
const VISITS_FILE = path.join(__dirname, 'unique_visits.json');
let uniqueIps = new Set();
let lastResetDate = new Date().toDateString();

// Load persistent data
if (fs.existsSync(VISITS_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(VISITS_FILE));
    if (data.date === lastResetDate) {
      uniqueIps = new Set(data.ips || []);
    }
  } catch (e) { uniqueIps = new Set(); }
}

app.get('/api/stats', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const today = new Date().toDateString();

  // Daily Reset check
  if (today !== lastResetDate) {
    uniqueIps.clear();
    lastResetDate = today;
  }

  // Add IP to set (only adds if not already present)
  uniqueIps.add(ip);

  // Save to disk every 5 new visitors
  if (uniqueIps.size % 5 === 0) {
    fs.writeFileSync(VISITS_FILE, JSON.stringify({ 
      date: lastResetDate, 
      ips: Array.from(uniqueIps) 
    }));
  }

  res.json({ count: uniqueIps.size });
});

// ─── Entry Pipeline ──────────────────────────────────────────
app.get('/entry', (req, res) => {
  const target = 'https://coe.annauniv.edu/home/';
  const bypassUrl = `https://translate.google.com/translate?sl=en&tl=en&u=${encodeURIComponent(target)}`;
  res.redirect(bypassUrl);
});

app.get('/api/ping', (req, res) => res.json({ status: 'online' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`SKView (Unique Mode) on http://localhost:${PORT}`);
  console.log(`Unique Visitors Today: ${uniqueIps.size}`);
});

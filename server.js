const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Visit Counter Logic ──────────────────────────────────────
const VISITS_FILE = path.join(__dirname, 'visits.json');
let visitCount = 0;

// Load initial count
if (fs.existsSync(VISITS_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(VISITS_FILE));
    visitCount = data.count || 0;
  } catch (e) { visitCount = 0; }
}

app.get('/api/stats', (req, res) => {
  visitCount++;
  // Save every 10 visits to reduce disk I/O
  if (visitCount % 10 === 0) {
    fs.writeFileSync(VISITS_FILE, JSON.stringify({ count: visitCount }));
  }
  res.json({ count: visitCount });
});

// ─── Entry Pipeline ──────────────────────────────────────────
app.get('/entry', (req, res) => {
  const target = 'https://coe.annauniv.edu/home/';
  const bypassUrl = `https://translate.google.com/translate?sl=en&tl=en&u=${encodeURIComponent(target)}`;
  res.redirect(bypassUrl);
});

// ─── Health Ping ──────────────────────────────────────────────
app.get('/api/ping', (req, res) => {
  // Simple ping endpoint for hunter
  res.json({ status: 'online' });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`SKView Active on http://localhost:${PORT}`);
  console.log(`Current Visit Count: ${visitCount}`);
});

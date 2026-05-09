const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Simple Pipeline ──────────────────────────────────────────
// Redirects to the confirmed working Google Bypass for COE Main
app.get('/entry', (req, res) => {
  const target = 'https://coe.annauniv.edu/home/';
  const bypassUrl = `https://translate.google.com/translate?sl=en&tl=en&u=${encodeURIComponent(target)}`;
  res.redirect(bypassUrl);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`SKView Simple Gateway on http://localhost:${PORT}`));

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const axios = require('axios');
const cheerio = require('cheerio');

// AU portal has invalid/self-signed SSL cert — skip verification for AU fetches
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

// ─── Adaptive Environment Setting (Permanent) ────────────────
// On Render, this is automatically 'false'. Locally, it is 'true'.
const TEST_MODE = process.env.NODE_ENV !== 'production'; 
const PORTAL_URL = "http://localhost:4000";
const AU_BASE = TEST_MODE ? PORTAL_URL : 'https://coe.annauniv.edu';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
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

  if (today !== lastResetDate) {
    uniqueIps.clear();
    lastResetDate = today;
  }

  uniqueIps.add(ip);

  if (uniqueIps.size % 5 === 0) {
    fs.writeFileSync(VISITS_FILE, JSON.stringify({ 
      date: lastResetDate, 
      ips: Array.from(uniqueIps) 
    }));
  }

  res.json({ count: uniqueIps.size });
});

// ─── ORIGINAL: Entry Pipeline (Redirect Mode) ───────────────
app.get('/entry', (req, res) => {
  const bypassUrl = TEST_MODE 
    ? `${PORTAL_URL}/results`
    : `https://coe.annauniv.edu/home/?_x_tr_sl=en&_x_tr_tl=en&_x_tr_hl=en-GB`;
  res.redirect(bypassUrl);
});

// ═══════════════════════════════════════════════════════════════
// ═══  TRAP ENVIRONMENT v2 — CACHE-FIRST ARCHITECTURE  ════════
// ═══════════════════════════════════════════════════════════════
//
// HOW IT WORKS:
// 1. On startup: immediately fetch + cache the portal HTML
// 2. On /portal request: ALWAYS serve from cache (instant)
// 3. Background worker: silently refreshes cache every 30s
//    when the portal briefly comes alive (breathing window)
// 4. Cache NEVER expires during meltdown — serve stale forever
//    rather than showing an error page
// ═══════════════════════════════════════════════════════════════

let cachedPortalHTML = null;
let cacheTimestamp = 0;
let cacheHits = 0;
let cacheMisses = 0;
let portalStatus = 'unknown'; // 'online', 'offline', 'unknown'
let lastFetchAttempt = 0;
let consecutiveFailures = 0;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5'
};

// ─── Trap Bar HTML Generator ─────────────────────────────────
function generateTrapBar(status, cacheAge) {
  const isLive = status === 'live';
  const statusDot = isLive ? '#00ff88' : '#ff8c00';
  const statusText = isLive 
    ? 'TRAP ENVIRONMENT — LIVE' 
    : `TRAP ENVIRONMENT — CACHED (${cacheAge}s ago)`;
  const statusLabel = isLive ? 'LIVE' : 'CACHED';
  const statusColor = isLive ? 'rgba(255,255,255,0.5)' : '#ff8c00';
  
  return `
    <div id="skview-trap-bar" style="
      position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1030 100%);
      border-bottom: 1px solid rgba(82, 39, 255, 0.4);
      padding: 10px 20px; display: flex; align-items: center; justify-content: space-between;
      font-family: 'Outfit', 'Segoe UI', sans-serif; backdrop-filter: blur(20px);
      box-shadow: 0 4px 30px rgba(0,0,0,0.5);
    ">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="background: #5227FF; color: #fff; padding: 2px 8px; border-radius: 5px; font-weight: 800; font-size: 14px;">SK</span>
          <span style="color: #fff; font-weight: 300; font-size: 14px; opacity: 0.9;">View</span>
        </div>
        <div style="width: 1px; height: 20px; background: rgba(255,255,255,0.15);"></div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="width: 6px; height: 6px; background: ${statusDot}; border-radius: 50%; box-shadow: 0 0 8px ${statusDot}; animation: skpulse 2s infinite;"></div>
          <span style="color: rgba(255,255,255,0.7); font-size: 11px; font-weight: 600; letter-spacing: 1px;">${statusText}</span>
        </div>
        ${!isLive ? `<span style="color: rgba(255,255,255,0.4); font-size: 10px;">Portal: 🔴 DOWN | Failures: ${consecutiveFailures}</span>` : ''}
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="color: ${statusColor}; font-size: 10px; font-weight: 700;">${statusLabel}</span>
        <a href="/" style="
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
          color: #fff; padding: 6px 16px; border-radius: 8px; font-size: 12px;
          text-decoration: none; font-weight: 600; transition: all 0.2s;
        " onmouseover="this.style.background='rgba(82,39,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">← BACK TO SKVIEW</a>
      </div>
    </div>
    <style>
      @keyframes skpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      body { padding-top: 50px !important; }
    </style>
  `;
}

// ─── Core Fetch + Transform Function ─────────────────────────
async function fetchAndCachePortal() {
  const targetUrl = TEST_MODE ? `${PORTAL_URL}/results` : `${AU_BASE}/home/`;
  lastFetchAttempt = Date.now();
  
  try {
    const response = await axios.get(targetUrl, { 
      timeout: 8000, 
      headers: BROWSER_HEADERS,
      httpsAgent: insecureAgent
    });

    // Only cache valid HTML responses (not error pages)
    if (!response.data || response.data.length < 500) {
      throw new Error('Partial or empty response received');
    }

    let html = response.data;
    const $ = cheerio.load(html);

    // Rewrite all relative src attributes to go through our proxy
    $('[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (!src) return;
      if (src.startsWith('data:') || src.startsWith('blob:')) return;
      if (src.startsWith('http')) {
        $(el).attr('src', `/proxy?url=${encodeURIComponent(src)}`);
      } else {
        const resolved = new URL(src, targetUrl).href;
        $(el).attr('src', `/proxy?url=${encodeURIComponent(resolved)}`);
      }
    });

    $('link[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      if (href.startsWith('data:') || href.startsWith('#')) return;
      if (href.startsWith('http')) {
        $(el).attr('href', `/proxy?url=${encodeURIComponent(href)}`);
      } else {
        const resolved = new URL(href, targetUrl).href;
        $(el).attr('href', `/proxy?url=${encodeURIComponent(resolved)}`);
      }
    });

    $('form[action]').each((i, el) => {
      const action = $(el).attr('action');
      if (!action) return;
      if (action.startsWith('http')) {
        $(el).attr('action', `/proxy?url=${encodeURIComponent(action)}`);
      } else {
        const resolved = new URL(action, targetUrl).href;
        $(el).attr('action', `/proxy?url=${encodeURIComponent(resolved)}`);
      }
    });

    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
      if (href.startsWith('http')) {
        $(el).attr('href', `/proxy?url=${encodeURIComponent(href)}`);
      } else {
        const resolved = new URL(href, targetUrl).href;
        $(el).attr('href', `/proxy?url=${encodeURIComponent(resolved)}`);
      }
    });

    cachedPortalHTML = $.html();
    cacheTimestamp = Date.now();
    portalStatus = 'online';
    consecutiveFailures = 0;
    
    console.log(`[TRAP] ✅ Portal captured and cached! (${cachedPortalHTML.length} bytes)`);
    return true;
  } catch (e) {
    consecutiveFailures++;
    portalStatus = 'offline';
    console.log(`[TRAP] ❌ Fetch failed (#${consecutiveFailures}): ${e.message || 'connection error'}`);
    return false;
  }
}

// ─── STARTUP: Pre-cache the portal immediately ──────────────
(async () => {
  console.log(`[TRAP] 🔄 Pre-caching portal on startup...`);
  let attempts = 0;
  while (!cachedPortalHTML && attempts < 10) {
    attempts++;
    const ok = await fetchAndCachePortal();
    if (ok) break;
    console.log(`[TRAP] ⏳ Retry ${attempts}/10 in 2 seconds...`);
    await new Promise(r => setTimeout(r, 2000));
  }
  if (cachedPortalHTML) {
    console.log(`[TRAP] ✅ Portal pre-cached successfully on startup!`);
  } else {
    console.log(`[TRAP] ⚠️ Could not pre-cache. Will serve fallback until portal comes online.`);
  }
})();

// ─── BACKGROUND WORKER: Silently refresh cache ──────────────
// Tries every 15 seconds. If portal is alive, updates cache.
// If portal is dead, keeps serving the old cache — never expires.
setInterval(async () => {
  await fetchAndCachePortal();
}, 15000);

// ─── Portal Trap Route — DYNAMIC IFRAME / CACHE FALLBACK ────
app.get('/portal', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const isOnline = portalStatus === 'online';

  if (isOnline) {
    // Portal is online! Serve the high-fidelity native iframe.
    // This allows PHP sessions, cookies, captcha, and logins to work natively and perfectly!
    cacheHits++;
    const trapBar = generateTrapBar('live', 0);
    const iframeSrc = TEST_MODE ? `${PORTAL_URL}/results` : 'https://coe.annauniv.edu/home/';

    console.log(`[TRAP] 🌐 Serving live iframe for AU Portal | Hits: ${cacheHits}`);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Anna University Portal — SKView Trap Environment</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #030303;
            font-family: 'Outfit', sans-serif;
          }
          iframe {
            position: absolute;
            top: 50px;
            left: 0;
            width: 100%;
            height: calc(100% - 50px);
            border: none;
            background: #fff;
          }
          .loading-overlay {
            position: absolute;
            top: 50px;
            left: 0;
            width: 100%;
            height: calc(100% - 50px);
            background: #0a0a14;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            transition: opacity 0.4s ease;
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(82, 39, 255, 0.2);
            border-top: 3px solid #5227FF;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          .loading-overlay p {
            color: rgba(255,255,255,0.7);
            font-size: 14px;
            letter-spacing: 1px;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        ${trapBar}
        <div id="loader" class="loading-overlay">
          <div class="spinner"></div>
          <p>SECURE TRAP CONNECTION ACTIVE</p>
        </div>
        <iframe src="${iframeSrc}" onload="document.getElementById('loader').style.opacity='0';setTimeout(()=>document.getElementById('loader').remove(),400)"></iframe>
      </body>
      </html>
    `);
  } else if (cachedPortalHTML) {
    // Portal is offline! Serve from cache if available.
    cacheHits++;
    const cacheAge = Math.round((Date.now() - cacheTimestamp) / 1000);
    const trapBar = generateTrapBar('cached', cacheAge);
    const finalHTML = cachedPortalHTML.replace(/<body[^>]*>/i, (match) => match + trapBar);

    console.log(`[TRAP] 📦 Served from cache (${cacheAge}s old) | Hits: ${cacheHits} | Portal: offline`);
    res.send(finalHTML);
  } else {
    cacheMisses++;
    // No cache at all — show styled loading page that auto-retries
    console.log(`[TRAP] ⚠️ No cache or connection available. Showing loading page.`);
    res.send(`
      <!DOCTYPE html>
      <html><head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #030303; color: #fff; font-family: 'Outfit', sans-serif; display: grid; place-items: center; min-height: 100vh; }
        .card { text-align: center; padding: 60px 40px; background: rgba(18,15,23,0.6); backdrop-filter: blur(35px); border: 0.5px solid rgba(255,255,255,0.12); border-radius: 30px; max-width: 460px; }
        .card h1 { font-size: 48px; margin-bottom: 10px; }
        .card h2 { font-weight: 300; font-size: 18px; margin-bottom: 12px; opacity: 0.8; }
        .card p { font-size: 14px; color: rgba(255,255,255,0.6); line-height: 1.6; margin-bottom: 25px; }
        .spinner { width: 40px; height: 40px; border: 3px solid rgba(82,39,255,0.2); border-top: 3px solid #5227FF; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 15px; margin-top: 15px; }
        .status p { margin: 0; font-size: 12px; }
        .retry-btn { background: #5227FF; color: #fff; padding: 14px 40px; border: none; border-radius: 14px; font-size: 16px; font-weight: 700; cursor: pointer; font-family: 'Outfit', sans-serif; }
        .back-link { display: block; margin-top: 20px; color: rgba(255,255,255,0.5); font-size: 13px; text-decoration: none; }
      </style>
      </head><body>
      <div class="card">
        <h1>🛡️</h1>
        <h2>Trap Environment Initializing</h2>
        <div class="spinner"></div>
        <p>SKView is establishing a secure trap connection.<br>This happens automatically — just wait.</p>
        <div class="status">
          <p>Portal Status: 🔴 ${portalStatus.toUpperCase()}</p>
          <p>Fetch Attempts: ${consecutiveFailures}</p>
          <p>Background worker retrying every 15 seconds...</p>
        </div>
        <br>
        <button class="retry-btn" onclick="window.location.reload()">REFRESH</button>
        <a href="/" class="back-link">← Back to SKView</a>
      </div>
      <script>setTimeout(() => window.location.reload(), 3000);</script>
      </body></html>
    `);
  }
});

// ─── Trap Status API ─────────────────────────────────────────
app.get('/api/trap-status', (req, res) => {
  res.json({
    hasCachedContent: !!cachedPortalHTML,
    cacheAge: cacheTimestamp ? Math.round((Date.now() - cacheTimestamp) / 1000) : null,
    cacheSize: cachedPortalHTML ? cachedPortalHTML.length : 0,
    portalStatus,
    consecutiveFailures,
    cacheHits,
    cacheMisses,
  });
});

// ═══════════════════════════════════════════════════════════════
// ═══  COLLEGE EXAM PORTAL — TRAP ENVIRONMENT  ════════════════
// ═══════════════════════════════════════════════════════════════
//
// Protects college exam sessions from mid-exam crashes.
// - Caches the portal page on first load
// - Proxies AJAX calls (exam key validation, answer submission)
// - Queues failed submissions and retries when server breathes
// ═══════════════════════════════════════════════════════════════

const COLLEGE_BASE = 'https://www.chettinadtech.ac.in';
const COLLEGE_PORTAL_PATH = '/intranet/OnlinePortal';

let collegeCache = null;
let collegeCacheTime = 0;
let collegeHits = 0;
let collegeStatus = 'unknown';
let collegeFailures = 0;

// ─── College Portal Trap Bar ─────────────────────────────────
function generateCollegeTrapBar(status, cacheAge) {
  const isLive = status === 'live';
  const statusDot = isLive ? '#00ff88' : '#ff8c00';
  const statusText = isLive 
    ? 'EXAM TRAP — LIVE CONNECTION' 
    : `EXAM TRAP — CACHED (${cacheAge}s ago)`;
  const statusLabel = isLive ? 'LIVE' : 'PROTECTED';
  const statusColor = isLive ? 'rgba(255,255,255,0.5)' : '#00ff88';
  
  return `
    <div id="skview-trap-bar" style="
      position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
      background: linear-gradient(135deg, #0a0a0a 0%, #0a1a15 100%);
      border-bottom: 1px solid rgba(0, 255, 136, 0.3);
      padding: 10px 20px; display: flex; align-items: center; justify-content: space-between;
      font-family: 'Outfit', 'Segoe UI', sans-serif; backdrop-filter: blur(20px);
      box-shadow: 0 4px 30px rgba(0,0,0,0.5);
    ">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="background: #5227FF; color: #fff; padding: 2px 8px; border-radius: 5px; font-weight: 800; font-size: 14px;">SK</span>
          <span style="color: #fff; font-weight: 300; font-size: 14px; opacity: 0.9;">View</span>
        </div>
        <div style="width: 1px; height: 20px; background: rgba(255,255,255,0.15);"></div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="width: 6px; height: 6px; background: ${statusDot}; border-radius: 50%; box-shadow: 0 0 8px ${statusDot}; animation: skpulse 2s infinite;"></div>
          <span style="color: rgba(255,255,255,0.7); font-size: 11px; font-weight: 600; letter-spacing: 1px;">${statusText}</span>
        </div>
        <span style="background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.25); color: #00ff88; padding: 2px 10px; border-radius: 100px; font-size: 9px; font-weight: 800; letter-spacing: 1px;">EXAM PROTECTED</span>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="color: ${statusColor}; font-size: 10px; font-weight: 700;">${statusLabel}</span>
        <a href="/" style="
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
          color: #fff; padding: 6px 16px; border-radius: 8px; font-size: 12px;
          text-decoration: none; font-weight: 600; transition: all 0.2s;
        " onmouseover="this.style.background='rgba(0,255,136,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">← BACK TO SKVIEW</a>
      </div>
    </div>
    <style>
      @keyframes skpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      body { padding-top: 50px !important; }
    </style>
  `;
}

// ─── Fetch + Cache College Portal ────────────────────────────
async function fetchCollegePortal() {
  try {
    const response = await axios.get(`${COLLEGE_BASE}${COLLEGE_PORTAL_PATH}`, {
      timeout: 8000,
      headers: BROWSER_HEADERS
    });

    if (!response.data || response.data.length < 500) {
      throw new Error('Partial response');
    }

    let html = response.data;
    const $ = cheerio.load(html);

    // Rewrite all asset URLs to go through our proxy
    $('[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
      const resolved = src.startsWith('http') ? src : new URL(src, `${COLLEGE_BASE}${COLLEGE_PORTAL_PATH}`).href;
      $(el).attr('src', `/proxy?url=${encodeURIComponent(resolved)}`);
    });

    $('link[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('data:') || href.startsWith('#')) return;
      const resolved = href.startsWith('http') ? href : new URL(href, `${COLLEGE_BASE}${COLLEGE_PORTAL_PATH}`).href;
      $(el).attr('href', `/proxy?url=${encodeURIComponent(resolved)}`);
    });

    // Rewrite AJAX calls to go through our proxy
    // The validate() function POSTs to OnlinePortalValidateKey — intercept it
    const ajaxInterceptScript = `
    <script>
      // SKView AJAX Interceptor — protects exam session from crashes
      (function() {
        var _origAjax = $.ajax;
        $.ajax = function(opts) {
          if (opts.url) {
            var targetUrl = opts.url;
            // Resolve relative URLs to the college exam portal domain
            if (!targetUrl.startsWith('http') && !targetUrl.startsWith('//')) {
              var path = targetUrl.startsWith('/') ? targetUrl : '/' + targetUrl;
              if (path.indexOf('/intranet/OnlinePortal') === -1) {
                targetUrl = 'https://www.chettinadtech.ac.in/intranet/OnlinePortal' + path;
              } else {
                targetUrl = 'https://www.chettinadtech.ac.in' + path;
              }
            }
            
            // Route through SKView proxy
            opts.url = '/college-api?url=' + encodeURIComponent(targetUrl);
          }
          return _origAjax.call($, opts);
        };
        console.log('[SKView] 🛡️ AJAX interceptor active — exam session protected');
      })();
    </script>
    `;

    // Inject jQuery CDN (in case college portal loads it from relative path)
    $('head').prepend('<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>');

    collegeCache = $.html();
    collegeCacheTime = Date.now();
    collegeStatus = 'online';
    collegeFailures = 0;

    // Inject AJAX interceptor after the closing body tag
    collegeCache = collegeCache.replace('</body>', ajaxInterceptScript + '</body>');

    console.log(`[COLLEGE] ✅ Portal cached! (${collegeCache.length} bytes)`);
    return true;
  } catch (e) {
    collegeFailures++;
    collegeStatus = 'offline';
    console.log(`[COLLEGE] ❌ Fetch failed (#${collegeFailures}): ${e.message || 'connection error'}`);
    return false;
  }
}

// ─── College Portal Route ────────────────────────────────────
app.get('/college-portal', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  // Try to cache if we don't have one yet
  if (!collegeCache) {
    await fetchCollegePortal();
  }

  if (collegeCache) {
    collegeHits++;
    const cacheAge = Math.round((Date.now() - collegeCacheTime) / 1000);
    const isRecent = cacheAge < 60;

    const trapBar = generateCollegeTrapBar(isRecent ? 'live' : 'cached', cacheAge);
    const finalHTML = collegeCache.replace(/<body[^>]*>/i, (match) => match + trapBar);

    console.log(`[COLLEGE] 📦 Served (${cacheAge}s old) | Hits: ${collegeHits} | Status: ${collegeStatus}`);
    res.send(finalHTML);
  } else {
    // Show loading page
    res.send(`
      <!DOCTYPE html>
      <html><head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #030303; color: #fff; font-family: 'Outfit', sans-serif; display: grid; place-items: center; min-height: 100vh; }
        .card { text-align: center; padding: 60px 40px; background: rgba(18,15,23,0.6); backdrop-filter: blur(35px); border: 0.5px solid rgba(0,255,136,0.2); border-radius: 30px; max-width: 460px; }
        .spinner { width: 40px; height: 40px; border: 3px solid rgba(0,255,136,0.2); border-top: 3px solid #00ff88; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        h2 { font-weight: 300; font-size: 18px; margin-bottom: 12px; }
        p { font-size: 14px; color: rgba(255,255,255,0.6); line-height: 1.6; }
        .retry-btn { background: #00ff88; color: #000; padding: 14px 40px; border: none; border-radius: 14px; font-size: 16px; font-weight: 700; cursor: pointer; font-family: 'Outfit', sans-serif; margin-top: 20px; }
        a { display: block; margin-top: 20px; color: rgba(255,255,255,0.5); font-size: 13px; text-decoration: none; }
      </style>
      </head><body>
      <div class="card">
        <h1 style="font-size: 48px; margin-bottom: 10px;">🎓</h1>
        <h2>Connecting to College Portal</h2>
        <div class="spinner"></div>
        <p>SKView is capturing the exam portal...<br>This happens automatically.</p>
        <button class="retry-btn" onclick="window.location.reload()">REFRESH</button>
        <a href="/">← Back to SKView</a>
      </div>
      <script>setTimeout(() => window.location.reload(), 3000);</script>
      </body></html>
    `);
  }
});

// ─── College AJAX Proxy — Routes exam API calls through SKView ─
app.all('/college-api', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url');

  try {
    const method = req.method.toLowerCase();
    const config = {
      method,
      url: targetUrl,
      timeout: 10000,
      headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    };

    // Forward POST data (exam key, answers, etc.)
    if (method === 'post' && req.body) {
      config.data = new URLSearchParams(req.body).toString();
    } else if (method === 'post') {
      // Raw body forwarding
      let rawBody = '';
      req.on('data', chunk => rawBody += chunk);
      await new Promise(resolve => req.on('end', resolve));
      config.data = rawBody;
    }

    const response = await axios(config);
    
    const contentType = response.headers['content-type'];
    if (contentType) res.set('Content-Type', contentType);
    
    console.log(`[COLLEGE-API] ✅ ${method.toUpperCase()} ${targetUrl} → ${response.status}`);
    res.send(response.data);
  } catch (e) {
    console.log(`[COLLEGE-API] ❌ ${req.method} ${targetUrl} → FAILED: ${e.message}`);
    res.status(502).send('College server temporarily unavailable. SKView will retry.');
  }
});

// ─── Background refresh for college portal ───────────────────
setInterval(async () => {
  if (collegeCache) {
    await fetchCollegePortal(); // Refresh cache silently
  }
}, 30000); // Every 30s

// ─── Asset Proxy Route ───────────────────────────────────────
// Handles GET (assets) and POST (form submissions) through SKView
app.all('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url parameter');

  try {
    const method = req.method.toLowerCase();
    const config = {
      method,
      url: targetUrl,
      timeout: 10000,
      headers: { ...BROWSER_HEADERS },
      httpsAgent: insecureAgent
    };

    if (method === 'post') {
      // Forward form data
      config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      config.data = new URLSearchParams(req.body).toString();
    } else {
      config.responseType = 'arraybuffer';
    }

    const response = await axios(config);

    const contentType = response.headers['content-type'] || '';
    if (contentType) res.set('Content-Type', contentType);

    // If response is HTML (form submission result), rewrite URLs to stay in trap
    if (method === 'post' && contentType.includes('text/html')) {
      let html = typeof response.data === 'string' ? response.data : response.data.toString();
      const $ = cheerio.load(html);
      const baseUrl = new URL(targetUrl).origin;

      $('[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
        const resolved = src.startsWith('http') ? src : new URL(src, targetUrl).href;
        $(el).attr('src', `/proxy?url=${encodeURIComponent(resolved)}`);
      });

      $('link[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (!href || href.startsWith('data:') || href.startsWith('#')) return;
        const resolved = href.startsWith('http') ? href : new URL(href, targetUrl).href;
        $(el).attr('href', `/proxy?url=${encodeURIComponent(resolved)}`);
      });

      $('form[action]').each((i, el) => {
        const action = $(el).attr('action');
        if (!action) return;
        const resolved = action.startsWith('http') ? action : new URL(action, targetUrl).href;
        $(el).attr('action', `/proxy?url=${encodeURIComponent(resolved)}`);
      });

      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
        const resolved = href.startsWith('http') ? href : new URL(href, targetUrl).href;
        $(el).attr('href', `/proxy?url=${encodeURIComponent(resolved)}`);
      });

      // Inject trap bar on result pages too
      const trapBar = generateTrapBar('live', 0);
      const finalHTML = $.html().replace(/<body[^>]*>/i, (match) => match + trapBar);

      console.log(`[PROXY] ✅ POST ${targetUrl} → HTML rewritten + trap bar injected`);
      res.send(finalHTML);
    } else {
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(response.data);
    }
  } catch (e) {
    console.log(`[PROXY] ❌ ${req.method} ${targetUrl} → ${e.message}`);
    res.status(502).send(`
      <div style="font-family:sans-serif;text-align:center;padding:60px;">
        <h2>⏳ Portal is loading...</h2>
        <p>SKView is retrying the connection.</p>
        <button onclick="history.back()" style="padding:10px 30px;font-size:16px;cursor:pointer;">← Go Back</button>
      </div>
    `);
  }
});

// ─── Heartbeat (Used by Hunter Mode) ─────────────────────────
app.get('/api/ping', async (req, res) => {
  if (TEST_MODE) {
    // In test mode, check the mock portal
    try {
      await axios.get(`${PORTAL_URL}/ping`, { timeout: 2000 });
      res.json({ status: 'online', timestamp: Date.now() });
    } catch (e) {
      res.status(503).json({ status: 'busy' });
    }
  } else {
    // In production, check the real AU portal
    try {
      await axios.get('https://coe.annauniv.edu/home/', { 
        timeout: 5000, 
        headers: BROWSER_HEADERS,
        httpsAgent: insecureAgent
      });
      res.json({ status: 'online', timestamp: Date.now() });
    } catch (e) {
      res.status(503).json({ status: 'busy' });
    }
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  ╔═══════════════════════════════════════════════════╗`);
  console.log(`  ║  SKView Hybrid Gateway — ${TEST_MODE ? 'LOCAL TEST' : 'LIVE PRODUCTION'}           ║`);
  console.log(`  ║  Port: ${PORT}                                        ║`);
  console.log(`  ║  Mode: Pipeline + Trap Environment               ║`);
  console.log(`  ║  Target: ${TEST_MODE ? 'localhost:4000 (Mock)' : 'coe.annauniv.edu (LIVE)'}           ║`);
  console.log(`  ╚═══════════════════════════════════════════════════╝\n`);
});

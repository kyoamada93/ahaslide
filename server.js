'use strict';
/*
 * Townhall AI & Data — realtime interactive presentation server.
 * Single process, in-memory state persisted to data/state.json.
 *
 * Pages:
 *   /            audience (mobile, via QR)
 *   /screen      projector / big screen
 *   /admin       presenter control panel (needs ADMIN_KEY)
 *   /moderator   Q&A moderation (needs ADMIN_KEY)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { hasProfanity } = require('./profanity');
const sheetSync = require('./sheet-sync');
const googleAuth = require('./google-auth');
const composio = require('./composio');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'momo-aidata';
// Optional separate key for the MC page: it can only pick/answer Q&A questions.
const MC_KEY = process.env.MC_KEY || '';
const MC_ACTIONS = new Set(['qa:highlight', 'qa:status', 'qa:next', 'goto']);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(__dirname, 'config.json');

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const slides = config.slides;
const slideById = Object.fromEntries(slides.map((s) => [s.id, s]));
const PROFANITY_FILTER = config.profanityFilter !== false;

const DUCK_COLORS = [
  '#FFD43B', '#FF6FB5', '#4DD0E1', '#9CCC65', '#FFA94D', '#B197FC',
  '#FF8787', '#63E6BE', '#74C0FC', '#F783AC', '#E599F7', '#FFE066',
];

// ---------------------------------------------------------------- state
function freshState() {
  return {
    slideIndex: 0,
    users: {}, // id -> {id, name, team, checkedInAt}
    words: {}, // slideId -> {userId: [word]}
    hiddenWords: {}, // slideId -> [normalized]
    votes: {}, // slideId -> {userId: optionIndex}
    pollOpen: {}, // slideId -> bool
    pollHidden: {}, // slideId -> bool: results hidden until the presenter reveals them
    pollEndsAt: {}, // slideId -> ms timestamp when voting auto-closes
    questions: [], // {id,userId,name,text,target,status,highlighted,upvotes[],createdAt}
    race: freshRace(),
    raceHistory: [],
    bigQr: false, // full-screen join QR on the projector
    pollView: {}, // slideId -> 'top3' | 'all' (what the screen shows once voting is closed)
    sheet: { url: '', auto: false, approve: false, lastAt: 0, lastMsg: '' }, // Google Sheet → Q&A import
    google: null, // { refreshToken, accessToken, expiresAt, email } — server-side only, never sent to clients
    feedback: {}, // userId -> {...}
  };
}
function freshRace() {
  return { phase: 'lobby', players: {}, countdownEnd: 0, startedAt: 0, endedAt: 0, finishOrder: [] };
}

let state = freshState();
try {
  if (fs.existsSync(STATE_FILE)) {
    state = Object.assign(freshState(), JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
    // A race in progress cannot survive a restart.
    if (state.race.phase === 'countdown' || state.race.phase === 'racing') state.race.phase = 'lobby';
    console.log(`Loaded state: ${Object.keys(state.users).length} users`);
  }
} catch (e) {
  console.error('Could not load state, starting fresh:', e.message);
}

let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(state), (err) => {
      if (err) return console.error('save failed', err.message);
      fs.rename(tmp, STATE_FILE, () => {});
    });
  }, 1000);
}

const currentSlide = () => slides[state.slideIndex];
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const normWord = (w) => w.toLocaleLowerCase('vi').normalize('NFC');
const newId = () => crypto.randomBytes(6).toString('hex');

// ---------------------------------------------------------------- views
function wordFreq(slideId) {
  const counts = new Map(); // norm -> {text, count}
  const hidden = new Set(state.hiddenWords[slideId] || []);
  for (const list of Object.values(state.words[slideId] || {})) {
    for (const w of list) {
      const n = normWord(w);
      if (hidden.has(n)) continue;
      const e = counts.get(n) || { text: w, count: 0 };
      e.count += 1;
      counts.set(n, e);
    }
  }
  return [...counts.entries()]
    .map(([key, v]) => ({ key, text: v.text, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 150);
}

function pollHidden(slideId) {
  return state.pollHidden[slideId] ?? !!slideById[slideId]?.hideResults;
}
// full = admin view; otherwise counts are withheld while results are hidden.
function pollResults(slideId, full = false) {
  const slide = slideById[slideId];
  const counts = slide.options.map(() => 0);
  for (const idx of Object.values(state.votes[slideId] || {})) if (counts[idx] !== undefined) counts[idx] += 1;
  const hidden = pollHidden(slideId);
  const endsAt = state.pollEndsAt[slideId] || 0;
  return {
    counts: hidden && !full ? null : counts,
    total: counts.reduce((a, b) => a + b, 0),
    open: state.pollOpen[slideId] !== false,
    hidden,
    endsIn: endsAt && state.pollOpen[slideId] !== false ? Math.max(0, endsAt - Date.now()) : 0,
    view: state.pollView[slideId] || 'top3',
  };
}

function publicQuestion(q) {
  return {
    id: q.id, name: q.name, text: q.text, target: q.target, status: q.status,
    highlighted: q.highlighted, upvotes: q.upvotes.length, createdAt: q.createdAt, flagged: !!q.flagged,
  };
}

function raceView() {
  const r = state.race;
  return {
    phase: r.phase,
    countdownLeft: Math.max(0, r.countdownEnd - Date.now()),
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    playerCount: Object.keys(r.players).length,
    finishOrder: r.finishOrder.map((id) => ({ id, name: r.players[id]?.name, color: r.players[id]?.color, no: r.players[id]?.no })),
    maxDurationSec: slideById.race?.maxDurationSec || 60,
  };
}

function feedbackSummary() {
  const list = Object.values(state.feedback);
  const avg = (k) => {
    const v = list.map((f) => f[k]).filter((x) => x >= 1 && x <= 5);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  return { count: list.length, overall: avg('overall'), content: avg('content'), organization: avg('organization') };
}

function approvedQuestions() {
  return state.questions
    .filter((q) => q.status === 'approved' || q.status === 'answered')
    .map(publicQuestion)
    .sort((a, b) => (b.highlighted - a.highlighted) || (a.status === 'answered') - (b.status === 'answered') || b.upvotes - a.upvotes || a.createdAt - b.createdAt);
}

// Phones get a slim view: no word list, names or slide list (300 phones x several updates/s adds up).
function audienceState() {
  const slide = currentSlide();
  const view = {
    eventTitle: config.eventTitle, eventSubtitle: config.eventSubtitle, qaTargets: config.qaTargets,
    slideIndex: state.slideIndex, slideCount: slides.length, slide,
  };
  if (slide.type === 'poll') view.poll = pollResults(slide.id);
  if (slide.type === 'race') view.race = raceView();
  if (slide.type === 'qa') view.questions = approvedQuestions().slice(0, 60);
  return view;
}

function publicState() {
  const slide = currentSlide();
  const view = {
    eventTitle: config.eventTitle,
    eventSubtitle: config.eventSubtitle,
    qaTargets: config.qaTargets,
    slideIndex: state.slideIndex,
    slideCount: slides.length,
    slides: slides.map((s) => ({ id: s.id, type: s.type, title: s.title, speaker: s.speaker })),
    slide,
    checkedIn: Object.keys(state.users).length,
    bigQr: !!state.bigQr,
    recentNames: Object.values(state.users).sort((a, b) => b.checkedInAt - a.checkedInAt).slice(0, 30).map((u) => u.name),
    questions: approvedQuestions(),
  };
  if (slide.type === 'wordcloud') view.words = wordFreq(slide.id);
  if (slide.type === 'poll') view.poll = pollResults(slide.id);
  if (slide.type === 'race') view.race = raceView();
  if (slide.type === 'feedback') view.feedback = feedbackSummary();
  return view;
}

function adminState() {
  return {
    users: Object.values(state.users).sort((a, b) => a.checkedInAt - b.checkedInAt),
    questions: state.questions.map(publicQuestion),
    words: Object.fromEntries(slides.filter((s) => s.type === 'wordcloud').map((s) => [s.id, wordFreq(s.id)])),
    hiddenWords: state.hiddenWords,
    polls: Object.fromEntries(slides.filter((s) => s.type === 'poll').map((s) => [s.id, pollResults(s.id, true)])),
    race: raceView(),
    raceHistory: state.raceHistory,
    feedback: feedbackSummary(),
    feedbackList: Object.values(state.feedback).sort((a, b) => b.at - a.at).slice(0, 200),
    online: io.engine.clientsCount,
    sheet: { ...state.sheet, url: state.sheet.url || config.qaSheetUrl || '' },
    google: { configured: googleAuth.configured(), connected: !!state.google, email: state.google?.email || '', composio: composio.configured(), composioAccount: composio.accountId() },
  };
}

function myState(userId) {
  const u = state.users[userId];
  const mine = { user: u || null, words: {}, votes: {}, upvoted: [], questions: [], feedbackDone: !!state.feedback[userId] };
  if (!u) return mine;
  for (const s of slides) {
    if (s.type === 'wordcloud') mine.words[s.id] = state.words[s.id]?.[userId] || [];
    if (s.type === 'poll') mine.votes[s.id] = state.votes[s.id]?.[userId] ?? null;
  }
  for (const q of state.questions) {
    if (q.upvotes.includes(userId)) mine.upvoted.push(q.id);
    if (q.userId === userId) mine.questions.push({ id: q.id, text: q.text, status: q.status });
  }
  const p = state.race.players[userId];
  mine.duck = p ? { color: p.color, no: p.no, rank: p.rank || null, colors: DUCK_COLORS } : null;
  return mine;
}

// ---------------------------------------------------------------- http
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false }, pingInterval: 10000, pingTimeout: 20000 });

const pub = path.join(__dirname, 'public');
// Pages link their CSS/JS with ?v=<build>, so every deploy forces browsers to fetch fresh files
// (a cached old stylesheet with new HTML is what broke the screen/admin layout after a redeploy).
const BUILD = (process.env.RAILWAY_GIT_COMMIT_SHA || String(Date.now())).slice(0, 12);
const pages = {};
function page(name) {
  if (!pages[name]) {
    pages[name] = fs.readFileSync(path.join(pub, name), 'utf8')
      .replace(/(href|src)="(\/(?:css|js)\/[^"?]+)"/g, `$1="$2?v=${BUILD}"`);
  }
  return (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.type('html').send(pages[name]); };
}
app.get('/', page('audience.html'));
app.get('/screen', page('screen.html'));
app.get('/admin', page('admin.html'));
app.get('/moderator', page('moderator.html'));
app.get('/mc', page('mc.html'));
// Branding slots: an admin upload in DATA_DIR/brand overrides the bundled default asset.
const BRAND = {
  'ai-data-logo': 'assets/ai-data-logo.png',
  bg: 'assets/bg.jpg',
  'bg-mobile': 'assets/bg-mobile.jpg',
};
const BRAND_DIR = path.join(DATA_DIR, 'brand');
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
app.get('/brand/:slot', (req, res) => {
  const slot = req.params.slot;
  if (!BRAND[slot]) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-cache');
  const meta = path.join(BRAND_DIR, slot + '.json');
  if (fs.existsSync(meta)) {
    const { type } = JSON.parse(fs.readFileSync(meta, 'utf8'));
    res.type(type);
    return res.sendFile(path.join(BRAND_DIR, slot + '.bin'));
  }
  res.sendFile(path.join(pub, BRAND[slot]));
});
app.post('/api/brand/:slot', express.raw({ type: IMAGE_TYPES, limit: '12mb' }), (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).send('Unauthorized');
  const slot = req.params.slot;
  const type = (req.get('content-type') || '').split(';')[0];
  if (!BRAND[slot]) return res.status(404).send('unknown slot');
  if (!IMAGE_TYPES.includes(type) || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).send('Cần file ảnh PNG/JPG/WebP/SVG');
  fs.mkdirSync(BRAND_DIR, { recursive: true });
  fs.writeFileSync(path.join(BRAND_DIR, slot + '.bin'), req.body);
  fs.writeFileSync(path.join(BRAND_DIR, slot + '.json'), JSON.stringify({ type, at: Date.now() }));
  io.emit('brand', slot);
  res.json({ ok: true });
});
app.delete('/api/brand/:slot', (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).send('Unauthorized');
  const slot = req.params.slot;
  if (!BRAND[slot]) return res.status(404).send('unknown slot');
  for (const ext of ['.bin', '.json']) fs.rmSync(path.join(BRAND_DIR, slot + ext), { force: true });
  io.emit('brand', slot);
  res.json({ ok: true });
});
app.use(express.static(pub, {
  setHeaders: (res, file) => {
    // html/css/js are revalidated (cheap 304s) so a redeploy never mixes new HTML with stale CSS.
    res.setHeader('Cache-Control', /\.(html|css|js)$/.test(file) ? 'no-cache' : 'public, max-age=3600');
  },
}));
app.get('/vendor/wordcloud2.js', (_req, res) => res.sendFile(require.resolve('wordcloud/src/wordcloud2.js')));

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}
function joinUrl(req) {
  const fixed = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  if (fixed) return fixed.replace(/\/$/, '');
  const host = req.get('host') || '';
  if (host && !/^(localhost|127\.|\[::1\])/.test(host)) {
    const proto = req.get('x-forwarded-proto') || req.protocol;
    return `${proto}://${host}`;
  }
  return `http://${lanIp()}:${PORT}`;
}
// Health + load metrics (CPU % and event-loop lag since the previous call).
const loopDelay = require('perf_hooks').monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
let lastCpu = process.cpuUsage(), lastCpuAt = Date.now();
app.get('/healthz', (_req, res) => {
  const m = process.memoryUsage();
  const cpu = process.cpuUsage(lastCpu), now = Date.now();
  const cpuPct = ((cpu.user + cpu.system) / 1000 / Math.max(1, now - lastCpuAt)) * 100;
  lastCpu = process.cpuUsage(); lastCpuAt = now;
  const lagP99 = loopDelay.percentile(99) / 1e6;
  loopDelay.reset();
  res.json({
    ok: true, clients: io.engine.clientsCount, users: Object.keys(state.users).length,
    rssMB: Math.round(m.rss / 1048576), cpuPct: Math.round(cpuPct), loopLagP99ms: Math.round(lagP99), uptimeSec: Math.round(process.uptime()),
  });
});
// ---------------------------------------------------------------- Google login (for private sheets)
const googleRedirect = (req) => process.env.GOOGLE_REDIRECT_URI || `${joinUrl(req)}/auth/google/callback`;
app.get('/auth/google', requireAdmin, (req, res) => {
  if (!googleAuth.configured()) {
    return res.status(400).type('html').send('<meta charset="utf-8"><body style="font-family:sans-serif;max-width:640px;margin:40px auto">'
      + '<h2>Chưa cấu hình Google OAuth</h2><p>Đặt biến <b>GOOGLE_CLIENT_ID</b> và <b>GOOGLE_CLIENT_SECRET</b> trên Railway (xem README, mục "Đăng nhập Google").</p>'
      + `<p>Redirect URI cần khai báo: <code>${googleRedirect(req)}</code></p><a href="/admin">← Về admin</a></body>`);
  }
  res.redirect(googleAuth.authorizeUrl(googleRedirect(req)));
});
app.get('/auth/google/callback', async (req, res) => {
  if (req.query.error) return res.redirect('/admin?google=' + encodeURIComponent(String(req.query.error)));
  if (!googleAuth.takeState(String(req.query.state || ''))) return res.redirect('/admin?google=expired');
  try {
    const g = await googleAuth.exchangeCode(String(req.query.code || ''), googleRedirect(req));
    state.google = { ...g, refreshToken: g.refreshToken || state.google?.refreshToken || '' };
    persist();
    io.to('admin').emit('admin', adminState());
    res.redirect('/admin?google=ok');
  } catch (e) {
    console.error('google login failed:', e.message);
    res.redirect('/admin?google=' + encodeURIComponent(e.message));
  }
});

app.get('/api/join', async (req, res) => {
  const url = joinUrl(req);
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'L', color: { dark: '#1a0010', light: '#ffffff' } });
  res.json({ url, svg });
});

function requireAdmin(req, res, next) {
  if (req.query.key === ADMIN_KEY || req.get('x-admin-key') === ADMIN_KEY) return next();
  res.status(401).send('Unauthorized');
}
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
function sendCsv(res, name, header, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  res.send('﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'));
}
app.get('/api/export/:what', requireAdmin, (req, res) => {
  const t = (ms) => (ms ? new Date(ms).toISOString() : '');
  const userName = (id) => state.users[id]?.name || '';
  switch (req.params.what) {
    case 'checkins':
      return sendCsv(res, 'checkins', ['name', 'team', 'checked_in_at'], Object.values(state.users).map((u) => [u.name, u.team, t(u.checkedInAt)]));
    case 'words':
      return sendCsv(res, 'wordcloud', ['slide', 'name', 'word'], Object.entries(state.words).flatMap(([sid, m]) => Object.entries(m).flatMap(([uid, ws]) => ws.map((w) => [sid, userName(uid), w]))));
    case 'votes': {
      const rows = [];
      for (const s of slides.filter((x) => x.type === 'poll')) {
        const r = pollResults(s.id, true);
        s.options.forEach((o, i) => rows.push([s.id, o, r.counts[i]]));
      }
      return sendCsv(res, 'votes', ['slide', 'option', 'votes'], rows);
    }
    case 'questions':
      return sendCsv(res, 'questions', ['target', 'question', 'status', 'upvotes', 'created_at'], state.questions.map((q) => [q.target, q.text, q.status, q.upvotes.length, t(q.createdAt)]));
    case 'feedback':
      return sendCsv(res, 'feedback', ['name', 'overall', 'content', 'organization', 'liked', 'suggestion', 'next_topics', 'at'], Object.values(state.feedback).map((f) => [f.anonymous ? '' : f.name, f.overall, f.content, f.organization, f.liked, f.suggestion, f.nextTopics, t(f.at)]));
    case 'race':
      return sendCsv(res, 'race', ['race', 'rank', 'name'], state.raceHistory.flatMap((r, i) => r.podium.map((p, j) => [i + 1, j + 1, p.name])));
    default:
      return res.status(404).send('unknown export');
  }
});

// ---------------------------------------------------------------- broadcast
let screenTimer = null;
let audienceTimer = null;
// urgent = slide or race-phase change: everyone must see it now, so skip the throttle.
function broadcast(urgent = false) {
  persist();
  if (urgent) {
    clearTimeout(screenTimer); clearTimeout(audienceTimer);
    screenTimer = audienceTimer = null;
    io.to('screen').to('admin').to('mc').emit('state', publicState());
    io.to('admin').emit('admin', adminState());
    io.to('aud').emit('state', audienceState());
    return;
  }
  if (!screenTimer) {
    screenTimer = setTimeout(() => {
      screenTimer = null;
      io.to('screen').to('admin').to('mc').emit('state', publicState());
      io.to('admin').emit('admin', adminState());
    }, 150);
  }
  if (!audienceTimer) {
    // ~150ms for a small room, up to ~0.8s with several hundred phones.
    const delay = Math.min(800, 150 + io.engine.clientsCount * 2);
    audienceTimer = setTimeout(() => {
      audienceTimer = null;
      io.to('aud').emit('state', audienceState());
    }, delay);
  }
}
const meTimers = new Map();
function pushMe(userId) {
  if (meTimers.has(userId)) return;
  meTimers.set(userId, setTimeout(() => {
    meTimers.delete(userId);
    io.to('u:' + userId).emit('me', myState(userId));
  }, 120));
}
function pushAllMe() {
  for (const id of Object.keys(state.users)) pushMe(id);
}

// ---------------------------------------------------------------- race engine
const tapBuckets = new Map(); // userId -> taps received but not yet applied
let raceTick = null;
const TICK_MS = 100;

function startRace() {
  const r = state.race;
  if (r.phase !== 'lobby' || !Object.keys(r.players).length) return false;
  r.phase = 'countdown';
  r.countdownEnd = Date.now() + 3500;
  for (const p of Object.values(r.players)) Object.assign(p, { progress: 0, rank: null, finishedAt: 0, taps: 0, budget: 0 });
  r.finishOrder = [];
  tapBuckets.clear();
  clearInterval(raceTick);
  raceTick = setInterval(tickRace, TICK_MS);
  return true;
}

function tickRace() {
  const r = state.race;
  const cfg = slideById.race || {};
  const now = Date.now();
  if (r.phase === 'countdown') {
    if (now >= r.countdownEnd) {
      r.phase = 'racing';
      r.startedAt = now;
      tapBuckets.clear();
      broadcast(true);
    }
    return;
  }
  if (r.phase !== 'racing') return;
  const finishTaps = cfg.finishTaps || 160;
  // Token bucket: at most maxTapsPerSecond taps count, however the client batches them.
  const perTick = ((cfg.maxTapsPerSecond || 14) * TICK_MS) / 1000;
  const step = 100 / finishTaps;
  for (const [id, p] of Object.entries(r.players)) {
    if (p.finishedAt) continue;
    p.budget = Math.min(perTick * 3, (p.budget || 0) + perTick);
    const pending = Math.min(tapBuckets.get(id) || 0, perTick * 4);
    const taps = Math.min(pending, Math.floor(p.budget));
    p.budget -= taps;
    if (pending - taps > 0) tapBuckets.set(id, pending - taps); else tapBuckets.delete(id);
    p.taps += taps;
    // Taps drive the duck; a little current keeps idle ducks drifting.
    p.progress = Math.min(100, p.progress + taps * step * (0.85 + Math.random() * 0.3) + 0.02);
    if (p.progress >= 100) {
      p.finishedAt = now;
      r.finishOrder.push(id);
      p.rank = r.finishOrder.length;
      pushMe(id);
    }
  }
  const total = Object.keys(r.players).length;
  const podium = Math.min(cfg.podium || 3, total);
  const timedOut = now - r.startedAt > (cfg.maxDurationSec || 60) * 1000;
  if (r.finishOrder.length >= podium || timedOut) {
    // Rank remaining ducks by distance.
    const rest = Object.entries(r.players).filter(([, p]) => !p.finishedAt).sort((a, b) => b[1].progress - a[1].progress);
    for (const [id, p] of rest) { r.finishOrder.push(id); p.rank = r.finishOrder.length; }
    r.phase = 'finished';
    r.endedAt = now;
    clearInterval(raceTick);
    raceTick = null;
    state.raceHistory.push({
      at: now,
      players: total,
      podium: r.finishOrder.slice(0, Math.max(3, podium)).map((id) => ({ name: r.players[id].name, team: state.users[id]?.team || '' })),
    });
    pushAllMe();
    broadcast(true);
  }
  emitRaceFrame();
}

let lastAudienceFrame = 0;
function emitRaceFrame() {
  const r = state.race;
  const ducks = Object.entries(r.players).map(([id, p]) => [id, p.name, p.color, Math.round(p.progress * 10) / 10, p.rank || 0, p.no || 0]);
  io.to('screen').emit('race:frame', { phase: r.phase, ducks, t: Date.now() - r.startedAt });
  const now = Date.now();
  if (now - lastAudienceFrame < 400) return;
  lastAudienceFrame = now;
  const sorted = [...ducks].sort((a, b) => (a[4] || 1e9) - (b[4] || 1e9) || b[3] - a[3]);
  sorted.forEach(([id, , , progress, rank], i) => io.to('u:' + id).emit('race:me', { progress, rank, position: i + 1, total: sorted.length }));
}

// ---------------------------------------------------------------- sockets
const rate = new Map(); // socket.id -> {t, n}
function limited(socket, perSec = 8) {
  const now = Date.now();
  const e = rate.get(socket.id) || { t: now, n: 0 };
  if (now - e.t > 1000) { e.t = now; e.n = 0; }
  e.n += 1;
  rate.set(socket.id, e);
  return e.n > perSec;
}

io.on('connection', (socket) => {
  let userId = null;
  let isAdmin = false;
  let isMc = false;
  const ack = (cb, payload) => typeof cb === 'function' && cb(payload);

  socket.join('aud');
  socket.emit('state', audienceState());

  socket.on('screen:join', () => {
    socket.leave('aud');
    socket.join('screen');
    socket.emit('state', publicState());
    emitRaceFrame();
  });

  socket.on('admin:auth', (key, cb) => {
    if (key === ADMIN_KEY) {
      isAdmin = true;
      socket.leave('aud');
      socket.join('admin');
      ack(cb, { ok: true, role: 'admin' });
      socket.emit('state', publicState());
      socket.emit('admin', adminState());
      return;
    }
    if (MC_KEY && key === MC_KEY) {
      isMc = true;
      socket.leave('aud');
      socket.join('mc');
      ack(cb, { ok: true, role: 'mc' });
      socket.emit('state', publicState());
      return;
    }
    ack(cb, { ok: false });
  });

  // ----- audience identity
  socket.on('hello', (id, cb) => {
    if (typeof id === 'string' && state.users[id]) {
      userId = id;
      socket.join('u:' + id);
      ack(cb, { ok: true });
      socket.emit('me', myState(id));
    } else ack(cb, { ok: false });
  });

  socket.on('checkin', (data, cb) => {
    if (limited(socket, 3)) return ack(cb, { ok: false, error: 'Thử lại sau giây lát' });
    const name = clean(data?.name, 40);
    if (name.length < 2) return ack(cb, { ok: false, error: 'Vui lòng nhập tên' });
    const id = userId && state.users[userId] ? userId : newId();
    state.users[id] = { id, name, team: clean(data?.team, 40), checkedInAt: state.users[id]?.checkedInAt || Date.now() };
    userId = id;
    socket.join('u:' + id);
    ack(cb, { ok: true, id });
    pushMe(id);
    broadcast();
  });

  const needUser = (cb) => {
    if (!userId || !state.users[userId]) { ack(cb, { ok: false, error: 'Bạn cần check-in trước' }); return false; }
    if (limited(socket)) { ack(cb, { ok: false, error: 'Chậm lại một chút nhé' }); return false; }
    return true;
  };

  socket.on('word:add', ({ slideId, word } = {}, cb) => {
    if (!needUser(cb)) return;
    const slide = slideById[slideId];
    if (!slide || slide.type !== 'wordcloud') return ack(cb, { ok: false });
    const w = clean(word, 30);
    if (!w) return ack(cb, { ok: false, error: 'Từ khoá trống' });
    const m = (state.words[slideId] ||= {});
    const list = (m[userId] ||= []);
    if (list.length >= (slide.maxPerUser || 3)) return ack(cb, { ok: false, error: `Tối đa ${slide.maxPerUser || 3} từ khoá` });
    if (list.some((x) => normWord(x) === normWord(w))) return ack(cb, { ok: false, error: 'Bạn đã gửi từ này rồi' });
    if (PROFANITY_FILTER && hasProfanity(w)) return ack(cb, { ok: false, error: 'Từ khoá chưa phù hợp, bạn thử từ khác nhé 🙏' });
    list.push(w);
    ack(cb, { ok: true });
    pushMe(userId);
    broadcast();
  });

  socket.on('poll:vote', ({ slideId, option } = {}, cb) => {
    if (!needUser(cb)) return;
    const slide = slideById[slideId];
    if (!slide || slide.type !== 'poll' || !Number.isInteger(option) || option < 0 || option >= slide.options.length) return ack(cb, { ok: false });
    if (state.pollOpen[slideId] === false) return ack(cb, { ok: false, error: 'Vote đã đóng' });
    (state.votes[slideId] ||= {})[userId] = option;
    ack(cb, { ok: true });
    pushMe(userId);
    broadcast();
  });

  socket.on('qa:ask', ({ text, target } = {}, cb) => {
    if (!needUser(cb)) return;
    const t = clean(text, 300);
    if (t.length < 3) return ack(cb, { ok: false, error: 'Câu hỏi quá ngắn' });
    if (state.questions.filter((q) => q.userId === userId && Date.now() - q.createdAt < 60000).length >= 3) {
      return ack(cb, { ok: false, error: 'Bạn gửi hơi nhanh, đợi 1 phút nhé' });
    }
    state.questions.push({
      // Q&A is always anonymous: the asker's name is never stored with the question.
      // Questions with profanity stay pending and are flagged for the moderator.
      id: newId(), userId, name: 'Ẩn danh', text: t, flagged: PROFANITY_FILTER && hasProfanity(t),
      target: (config.qaTargets || []).includes(target) ? target : (config.qaTargets || [])[0] || '',
      status: 'pending', highlighted: false, upvotes: [], createdAt: Date.now(),
    });
    ack(cb, { ok: true });
    pushMe(userId);
    broadcast();
  });

  socket.on('qa:upvote', (qid, cb) => {
    if (!needUser(cb)) return;
    const q = state.questions.find((x) => x.id === qid && x.status === 'approved');
    if (!q) return ack(cb, { ok: false });
    const i = q.upvotes.indexOf(userId);
    if (i >= 0) q.upvotes.splice(i, 1); else q.upvotes.push(userId);
    ack(cb, { ok: true });
    pushMe(userId);
    broadcast();
  });

  socket.on('race:join', (cb) => {
    if (!userId || !state.users[userId]) return ack(cb, { ok: false, error: 'Bạn cần check-in trước' });
    const r = state.race;
    if (!r.players[userId]) {
      if (r.phase !== 'lobby') return ack(cb, { ok: false, error: 'Cuộc đua đang diễn ra, đợi lượt sau nhé' });
      const n = Object.keys(r.players).length;
      r.players[userId] = { no: n + 1, name: state.users[userId].name, color: DUCK_COLORS[n % DUCK_COLORS.length], progress: 0, rank: null, finishedAt: 0, taps: 0, budget: 0 };
    }
    ack(cb, { ok: true });
    pushMe(userId);
    emitRaceFrame();
    broadcast();
  });

  socket.on('race:color', (color, cb) => {
    const p = userId && state.race.players[userId];
    if (!p || state.race.phase !== 'lobby' || !DUCK_COLORS.includes(color)) return ack(cb, { ok: false });
    p.color = color;
    ack(cb, { ok: true });
    pushMe(userId);
    emitRaceFrame();
  });

  socket.on('race:tap', (n) => {
    if (!userId || state.race.phase !== 'racing' || !state.race.players[userId]) return;
    const taps = Math.max(0, Math.min(10, Number(n) || 0));
    tapBuckets.set(userId, (tapBuckets.get(userId) || 0) + taps);
  });

  socket.on('feedback:submit', (f = {}, cb) => {
    if (!needUser(cb)) return;
    const star = (v) => { const x = Number(v); return Number.isInteger(x) && x >= 1 && x <= 5 ? x : 0; };
    if (!star(f.overall)) return ack(cb, { ok: false, error: 'Vui lòng chấm điểm tổng thể' });
    state.feedback[userId] = {
      name: state.users[userId].name, anonymous: !!f.anonymous,
      overall: star(f.overall), content: star(f.content), organization: star(f.organization),
      liked: clean(f.liked, 500), suggestion: clean(f.suggestion, 1000), nextTopics: clean(f.nextTopics, 500), at: Date.now(),
    };
    ack(cb, { ok: true });
    pushMe(userId);
    broadcast();
  });

  // ----- admin / moderator actions
  socket.on('admin:action', (a = {}, cb) => {
    // MC role: only choose / answer questions and bring the Q&A slide up.
    const mcAllowed = isMc && MC_ACTIONS.has(a.type)
      && (a.type !== 'qa:status' || ['answered', 'approved'].includes(a.status))
      && (a.type !== 'goto' || slides[a.index]?.type === 'qa');
    if (!isAdmin && !mcAllowed) return ack(cb, { ok: false, error: 'unauthorized' });
    const q = a.qid && state.questions.find((x) => x.id === a.qid);
    switch (a.type) {
      case 'goto':
        if (Number.isInteger(a.index) && a.index >= 0 && a.index < slides.length) state.slideIndex = a.index;
        break;
      case 'next': state.slideIndex = Math.min(slides.length - 1, state.slideIndex + 1); break;
      case 'prev': state.slideIndex = Math.max(0, state.slideIndex - 1); break;
      case 'qa:status':
        if (q && ['pending', 'approved', 'rejected', 'answered'].includes(a.status)) {
          q.status = a.status;
          if (a.status !== 'approved') q.highlighted = false;
          if (q.userId) pushMe(q.userId);
        }
        break;
      case 'qa:highlight':
        if (q) {
          const on = !q.highlighted;
          state.questions.forEach((x) => { x.highlighted = false; });
          q.highlighted = on;
          if (on) q.status = 'approved';
        }
        break;
      case 'qa:next': {
        // Mark the question on screen as answered and put the next top question up.
        const cur = state.questions.find((x) => x.highlighted);
        if (cur) { cur.highlighted = false; cur.status = 'answered'; }
        const next = state.questions
          .filter((x) => x.status === 'approved')
          .sort((x, y) => y.upvotes.length - x.upvotes.length || x.createdAt - y.createdAt)[0];
        if (next) next.highlighted = true;
        break;
      }
      case 'qa:add': {
        // Organisers can seed questions; they go straight to the live queue.
        const t = clean(a.text, 300);
        if (t.length < 3) return ack(cb, { ok: false, error: 'Câu hỏi quá ngắn' });
        state.questions.push({
          id: newId(), userId: null, name: 'Ban tổ chức', text: t, target: '', flagged: false,
          status: a.pending ? 'pending' : 'approved', highlighted: false, upvotes: [], createdAt: Date.now(),
        });
        break;
      }
      case 'qr:toggle': state.bigQr = !state.bigQr; break;
      case 'poll:view': state.pollView[a.slideId] = (state.pollView[a.slideId] || 'top3') === 'top3' ? 'all' : 'top3'; break;
      case 'sheet:config':
        state.sheet.url = clean(a.url, 500);
        state.sheet.auto = !!a.auto;
        state.sheet.approve = !!a.approve;
        break;
      case 'google:logout': state.google = null; break;
      case 'sheet:sync':
        // async: answer when the import finishes
        importSheet().then((r) => { ack(cb, r); broadcast(); });
        return;
      case 'qa:delete':
        state.questions = state.questions.filter((x) => x.id !== a.qid);
        break;
      case 'word:hide': {
        const list = (state.hiddenWords[a.slideId] ||= []);
        if (a.key && !list.includes(a.key)) list.push(a.key);
        break;
      }
      case 'word:unhide':
        state.hiddenWords[a.slideId] = (state.hiddenWords[a.slideId] || []).filter((k) => k !== a.key);
        break;
      case 'words:reset': delete state.words[a.slideId]; delete state.hiddenWords[a.slideId]; pushAllMe(); break;
      case 'poll:toggle':
        state.pollOpen[a.slideId] = state.pollOpen[a.slideId] === false;
        delete state.pollEndsAt[a.slideId];
        break;
      case 'poll:reveal': state.pollHidden[a.slideId] = !pollHidden(a.slideId); break;
      case 'poll:timer': {
        const sec = Number(a.seconds);
        if (!slideById[a.slideId] || !(sec >= 5 && sec <= 1200)) return ack(cb, { ok: false, error: 'Thời gian 5s–20 phút' });
        state.pollOpen[a.slideId] = true;
        state.pollEndsAt[a.slideId] = Date.now() + sec * 1000;
        break;
      }
      case 'poll:reset':
        delete state.votes[a.slideId]; delete state.pollEndsAt[a.slideId]; state.pollOpen[a.slideId] = true;
        pushAllMe();
        break;
      case 'race:start':
        if (!startRace()) return ack(cb, { ok: false, error: 'Chưa có người chơi hoặc đua đang diễn ra' });
        break;
      case 'race:reset':
      case 'race:rematch': {
        clearInterval(raceTick);
        raceTick = null;
        const keep = a.type === 'race:rematch' ? state.race.players : {};
        state.race = freshRace();
        for (const [id, p] of Object.entries(keep)) state.race.players[id] = { ...p, progress: 0, rank: null, finishedAt: 0, taps: 0 };
        pushAllMe();
        emitRaceFrame();
        break;
      }
      case 'reset:all':
        if (a.confirm !== 'RESET') return ack(cb, { ok: false, error: 'confirm required' });
        clearInterval(raceTick);
        // Wipe event data but keep the Google login and sheet settings.
        state = Object.assign(freshState(), { google: state.google, sheet: state.sheet });
        io.emit('reset');
        break;
      default:
        return ack(cb, { ok: false, error: 'unknown action' });
    }
    ack(cb, { ok: true });
    broadcast(['goto', 'next', 'prev', 'race:start', 'race:reset', 'race:rematch', 'reset:all', 'poll:toggle', 'poll:reveal', 'poll:timer', 'qa:highlight', 'qa:next', 'qr:toggle', 'poll:view'].includes(a.type));
  });

  socket.on('disconnect', () => rate.delete(socket.id));
});

// ---------------------------------------------------------------- Google Sheet → Q&A
let sheetBusy = false;
async function importSheet() {
  const url = state.sheet.url || config.qaSheetUrl || '';
  if (sheetBusy) return { ok: false, error: 'Đang đồng bộ…' };
  sheetBusy = true;
  try {
    // Source, in order: own Google login → Composio connection → public CSV export.
    const { questions, skipped } = state.google
      ? sheetSync.extractQuestions(await googleAuth.readRows(url, state.google))
      : composio.configured()
        ? sheetSync.extractQuestions(await composio.readRows(url))
        : await sheetSync.fetchSheet(url);
    const have = new Set(state.questions.map((q) => q.sheetKey).filter(Boolean));
    let added = 0;
    for (const q of questions) {
      if (have.has(q.key)) continue;
      state.questions.push({
        id: newId(), userId: null, name: 'Google Form', text: q.text, target: '', sheetKey: q.key,
        flagged: PROFANITY_FILTER && hasProfanity(q.text),
        status: state.sheet.approve ? 'approved' : 'pending', highlighted: false, upvotes: [], createdAt: q.at,
      });
      added++;
    }
    state.sheet.lastAt = Date.now();
    state.sheet.lastMsg = `+${added} câu mới · ${questions.length} câu trong sheet${skipped ? ` · bỏ qua ${skipped} câu chỉ cần trả lời sau` : ''}`;
    return { ok: true, added, total: questions.length, skipped, msg: state.sheet.lastMsg };
  } catch (e) {
    state.sheet.lastAt = Date.now();
    state.sheet.lastMsg = '⚠️ ' + (e.name === 'TimeoutError' ? 'Google Sheet không phản hồi' : e.message);
    return { ok: false, error: state.sheet.lastMsg };
  } finally {
    sheetBusy = false;
  }
}
setInterval(() => {
  if (state.sheet.auto && (state.sheet.url || config.qaSheetUrl)) importSheet().then((r) => { if (r.added) broadcast(); else persist(); });
}, 60000);

// Auto-close polls whose timer ran out.
setInterval(() => {
  const now = Date.now();
  for (const [sid, endsAt] of Object.entries(state.pollEndsAt)) {
    if (endsAt && now >= endsAt) {
      state.pollOpen[sid] = false;
      delete state.pollEndsAt[sid];
      broadcast(true);
    }
  }
}, 250);

// Keep admin "online" counter fresh.
setInterval(() => io.to('admin').emit('admin', adminState()), 5000);

server.listen(PORT, () => {
  console.log(`Townhall running on http://localhost:${PORT}`);
  console.log(`  Audience : ${process.env.PUBLIC_URL || `http://${lanIp()}:${PORT}`}/`);
  console.log(`  Screen   : http://localhost:${PORT}/screen`);
  console.log(`  Admin    : http://localhost:${PORT}/admin?key=${ADMIN_KEY}`);
  console.log(`  Moderator: http://localhost:${PORT}/moderator?key=${ADMIN_KEY}`);
  console.log(`  MC       : http://localhost:${PORT}/mc?key=${MC_KEY || ADMIN_KEY}`);
});

function shutdown() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

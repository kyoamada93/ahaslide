// Load test: N simulated phones (spread over several worker processes) go through the whole program
// while we measure latency and server CPU.
//   node scripts/load-test.js                 -> boots a local server and runs 300 users
//   node scripts/load-test.js 300 https://your-app.onrender.com YOUR_ADMIN_KEY   -> test a deployed server
const { fork, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { io: rawIo } = require('socket.io-client');

// Behind an HTTP(S) proxy (e.g. a sandbox), socket.io-client needs an explicit agent.
const PROXY = process.env.LOADTEST_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || '';
let proxyAgent = null;
if (PROXY) { try { const { HttpsProxyAgent } = require('https-proxy-agent'); proxyAgent = new HttpsProxyAgent(PROXY); } catch {} }
const io = (url, opts = {}) => rawIo(url, proxyAgent && url.startsWith('https') ? { ...opts, agent: proxyAgent } : opts);

const WORKER = process.argv[2] === '--worker';

// ---------------------------------------------------------------- worker: a batch of bots
if (WORKER) {
  const [, , , url, from, count] = process.argv;
  const bots = [];
  const send = (m) => process.send(m);
  const timed = (s, ev, payload, kind) => new Promise((resolve) => {
    const t0 = Date.now();
    s.emit(ev, payload, (res) => { send({ type: 'lat', kind, ms: Date.now() - t0, ok: !!res?.ok }); resolve(res); });
  });
  for (let i = 0; i < Number(count); i++) {
    const n = Number(from) + i;
    const s = io(url, { transports: ['websocket'], forceNew: true, reconnection: true });
    s.on('disconnect', (why) => send({ type: 'disconnect', why }));
    const bot = { s, n, slide: -1, done: new Set(), tapper: null, raceMe: 0 };
    bots.push(bot);
    s.on('connect', async () => {
      // Like the real phone: after a reconnect, re-identify with the saved user id.
      if (bot.uid) { send({ type: 'reconnect' }); s.emit('hello', bot.uid, () => {}); return; }
      if (bot.done.has('in')) return;
      bot.done.add('in');
      const res = await timed(s, 'checkin', { name: `load.${n}` }, 'checkin');
      bot.uid = res?.id;
      send({ type: 'ready' });
    });
    s.on('race:me', () => { bot.raceMe++; });
    s.on('state', (st) => {
      if (st.slideIndex !== bot.slide) { bot.slide = st.slideIndex; send({ type: 'slide', idx: st.slideIndex, t: Date.now() }); }
      const sl = st.slide;
      const once = (k, ms, fn) => { if (!bot.done.has(k)) { bot.done.add(k); setTimeout(fn, Math.random() * ms); } };
      if (sl.type === 'wordcloud') once('w', 3000, async () => { await timed(s, 'word:add', { slideId: sl.id, word: ['GenAI', 'LLM', 'Agent', 'Networking', 'Roadmap', 'Data'][n % 6] }, 'word'); });
      if (sl.type === 'poll') once('p', 3000, () => timed(s, 'poll:vote', { slideId: sl.id, option: n % sl.options.length }, 'vote'));
      if (sl.type === 'qa') {
        if (n % 5 === 0) once('q', 3000, () => timed(s, 'qa:ask', { text: `Câu hỏi tải số ${n}?` }, 'ask'));
        for (const q of st.questions || []) if ((n + q.id.charCodeAt(0)) % 3 === 0) once('u' + q.id, 2000, () => timed(s, 'qa:upvote', q.id, 'upvote'));
      }
      if (sl.type === 'race') {
        if (st.race.phase === 'lobby') once('rj' + st.race.playerCount, 2000, () => { if (!bot.joined) { bot.joined = true; timed(s, 'race:join', undefined, 'race-join'); } });
        if (st.race.phase === 'racing' && !bot.tapper) {
          const tps = 6 + (n % 7); // 6..12 taps per second, batched every 250ms like the real client
          bot.tapper = setInterval(() => s.emit('race:tap', Math.round((tps * 250) / 1000 + Math.random() - 0.5)), 250);
        }
        if (st.race.phase === 'finished' && bot.tapper) { clearInterval(bot.tapper); bot.tapper = null; send({ type: 'raceMe', n: bot.raceMe }); }
      }
      if (sl.type === 'feedback') once('f', 3000, () => timed(s, 'feedback:submit', { overall: 4 + (n % 2), content: 4, organization: 5, suggestion: 'ok' }, 'feedback'));
    });
  }
  process.on('message', (m) => { if (m === 'stop') { bots.forEach((b) => b.s.close()); process.exit(0); } });
  return;
}

// ---------------------------------------------------------------- main: orchestrate + report
const N = Number(process.argv[2]) || 300;
let URL = process.argv[3];
let KEY = process.argv[4] || 'load-key';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]; };

(async () => {
  let srv = null, dataDir = null;
  if (!URL) {
    const port = 4100 + Math.floor(Math.random() * 400);
    URL = `http://localhost:${port}`;
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-load-'));
    srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: port, ADMIN_KEY: KEY, DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('running') && r()));
  }
  console.log(`Load test: ${N} users → ${URL}`);

  const lat = {}; const slideSeen = {}; let ready = 0; const raceMe = [];
  let reconnects = 0; const disconnects = {};
  const WORKERS = Math.min(4, Math.ceil(N / 100));
  const workers = [];
  for (let w = 0; w < WORKERS; w++) {
    const from = Math.floor((w * N) / WORKERS), to = Math.floor(((w + 1) * N) / WORKERS);
    const child = fork(__filename, ['--worker', URL, String(from), String(to - from)]);
    child.on('message', (m) => {
      if (m.type === 'lat') { (lat[m.kind] ||= { ms: [], fail: 0 }).ms.push(m.ms); if (!m.ok) lat[m.kind].fail++; }
      if (m.type === 'ready') ready++;
      if (m.type === 'slide') (slideSeen[m.idx] ||= []).push(m.t);
      if (m.type === 'raceMe') raceMe.push(m.n);
      if (m.type === 'reconnect') reconnects++;
      if (m.type === 'disconnect') disconnects[m.why] = (disconnects[m.why] || 0) + 1;
    });
    workers.push(child);
  }

  const samples = [];
  let phase = 'check-in';
  const sampler = setInterval(async () => {
    const label = phase;
    try { samples.push({ ...(await (await fetch(URL + '/healthz')).json()), phase: label }); } catch {}
  }, 1000);

  const admin = io(URL, { transports: ['websocket'] });
  await new Promise((r) => admin.on('connect', r));
  const auth = await new Promise((r) => admin.emit('admin:auth', KEY, r));
  if (!auth.ok) { console.error('Admin key rejected'); process.exit(1); }
  let A = null; admin.on('admin', (a) => { A = a; });
  let P = null; admin.on('state', (s) => { P = s; });
  const act = (a) => new Promise((r) => admin.emit('admin:action', a, r));
  const gotoTimes = {};
  const idx = (type) => P.slides.findIndex((x) => x.type === type);
  const goto = async (index, settle) => { gotoTimes[index] = Date.now(); await act({ type: 'goto', index }); await wait(settle); };

  await act({ type: 'goto', index: 0 });
  const t0 = Date.now();
  while (ready < N && Date.now() - t0 < 60000) await wait(200);
  console.log(`  checked in: ${ready}/${N} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  phase = 'wordcloud'; await goto(idx('wordcloud'), 6000);
  phase = 'vote'; await goto(idx('poll'), 6000);
  console.log(`  votes counted: ${P.poll?.total}`);
  phase = 'qa'; await goto(idx('qa'), 5000);
  for (const q of (A?.questions || []).slice(0, 10)) await act({ type: 'qa:status', qid: q.id, status: 'approved' });
  await wait(4000);
  await act({ type: 'race:reset' }); // fresh lobby even if an earlier run left a finished race
  phase = 'race-lobby'; await goto(idx('race'), 4000);
  console.log(`  race players: ${P.race?.playerCount}`);
  phase = 'race'; const rStart = Date.now();
  await act({ type: 'race:start' });
  while (P.race?.phase !== 'finished' && Date.now() - rStart < 90000) await wait(200);
  const raceSecs = (Date.now() - rStart) / 1000;
  console.log(`  race: ${P.race?.phase} in ${raceSecs.toFixed(1)}s (incl. 3.5s countdown), winner: ${P.race?.finishOrder?.[0]?.name}`);
  await wait(1500);
  phase = 'feedback'; await goto(idx('feedback'), 6000);
  clearInterval(sampler);

  // ---- report
  console.log('\n  Slide change → all phones updated');
  for (const [idx, times] of Object.entries(slideSeen)) {
    if (!gotoTimes[idx]) continue;
    const d = times.map((t) => t - gotoTimes[idx]);
    console.log(`    slide ${Number(idx) + 1}: ${times.length}/${N} phones, p50 ${pct(d, 50)}ms, p95 ${pct(d, 95)}ms, max ${Math.max(...d)}ms`);
  }
  console.log('\n  Action round-trip (emit → ack)');
  for (const [k, v] of Object.entries(lat)) console.log(`    ${k.padEnd(10)} n=${String(v.ms.length).padEnd(4)} p50 ${pct(v.ms, 50)}ms  p95 ${pct(v.ms, 95)}ms  max ${Math.max(...v.ms)}ms  failed ${v.fail}`);
  console.log(`\n  Disconnects during the run: ${JSON.stringify(disconnects)} · reconnected and re-identified: ${reconnects}`);
  if (raceMe.length) console.log(`\n  Phone race updates: avg ${(raceMe.reduce((a, b) => a + b, 0) / raceMe.length).toFixed(0)} per phone during the race`);
  console.log('\n  Server CPU by phase (% of one core: avg / peak)');
  for (const ph of [...new Set(samples.map((x) => x.phase))]) {
    const c = samples.filter((x) => x.phase === ph).map((x) => x.cpuPct);
    console.log(`    ${ph.padEnd(11)} ${Math.round(c.reduce((a, b) => a + b, 0) / c.length)}% / ${Math.max(...c)}%`);
  }
  const cpu = samples.map((s) => s.cpuPct), lag = samples.map((s) => s.loopLagP99ms), rss = samples.map((s) => s.rssMB);
  console.log(`\n  Server: CPU avg ${Math.round(cpu.reduce((a, b) => a + b, 0) / cpu.length)}% / peak ${Math.max(...cpu)}% of one core, event-loop lag p99 peak ${Math.max(...lag)}ms, memory peak ${Math.max(...rss)}MB, peak clients ${Math.max(...samples.map((s) => s.clients))}`);

  workers.forEach((w) => w.send('stop'));
  admin.close();
  if (srv) { await new Promise((r) => { srv.on('exit', r); srv.kill('SIGTERM'); }); fs.rmSync(dataDir, { recursive: true, force: true }); }
  setTimeout(() => process.exit(0), 500);
})();

// End-to-end test: boots the server on a temp port/data dir and drives the whole program with fake users.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const http = require('http');
const { io } = require('socket.io-client');

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const KEY = 'test-key';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, ...args) => new Promise((r) => s.emit(ev, ...args, r));

(async () => {
  // Fake Google (OAuth token endpoint + Sheets API) so the login → sync flow runs offline.
  const idToken = ['x', Buffer.from(JSON.stringify({ email: 'nghia@example.com' })).toString('base64url'), 'y'].join('.');
  const fakeGoogle = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const json = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
      if (req.url === '/token') {
        const p = new URLSearchParams(body);
        if (p.get('client_secret') !== 'test-secret') return json(401, { error: 'invalid_client' });
        if (p.get('grant_type') === 'authorization_code') return p.get('code') === 'good' ? json(200, { access_token: 'at1', refresh_token: 'rt1', expires_in: 1, id_token: idToken }) : json(400, { error: 'invalid_grant' });
        if (p.get('grant_type') === 'refresh_token') return json(200, { access_token: 'at2', expires_in: 3600 });
      }
      if (!/^Bearer at[12]$/.test(req.headers.authorization || '')) return json(401, { error: { message: 'unauthenticated' } });
      if (req.url.startsWith('/sheets/PRIVATEID?')) return json(200, { sheets: [{ properties: { sheetId: 0, title: 'Other' } }, { properties: { sheetId: 2088885041, title: 'Form_Responses' } }] });
      if (req.url.startsWith('/sheets/PRIVATEID/values/')) {
        assert.ok(decodeURIComponent(req.url).includes("'Form_Responses'"), 'reads the tab from #gid');
        return json(200, { values: [['Timestamp', 'Câu hỏi của bạn', 'Bạn muốn câu hỏi được xử lý thế nào?'], ['10/21/2026 9:28:35', 'Câu hỏi từ sheet riêng tư?', 'Cả hai']] });
      }
      json(404, { error: { message: 'not found' } });
    });
  }).listen(0);
  await new Promise((r) => fakeGoogle.once('listening', r));
  const G = `http://localhost:${fakeGoogle.address().port}`;
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, ADMIN_KEY: KEY, MC_KEY: 'mc-key', DATA_DIR: dataDir,
    GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_AUTH_URL: `${G}/auth`, GOOGLE_TOKEN_URL: `${G}/token`, GOOGLE_SHEETS_API: `${G}/sheets` }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('running') && r()));
  let failed = false;
  try {
    const connect = () => new Promise((r) => { const s = io(URL, { transports: ['websocket'] }); s.on('connect', () => r(s)); });
    const admin = await connect();
    assert.equal((await call(admin, 'admin:auth', 'wrong')).ok, false, 'bad key rejected');
    assert.equal((await call(admin, 'admin:auth', KEY)).ok, true);
    let pub = null; admin.on('state', (s) => { pub = s; });
    let adm = null; admin.on('admin', (a) => { adm = a; });
    const act = async (a) => { const r = await call(admin, 'admin:action', a); assert.ok(r.ok, JSON.stringify([a, r])); await wait(250); };

    // HTTP pages + QR
    for (const p of ['/', '/screen', '/admin', '/moderator', '/mc', '/vendor/wordcloud2.js', '/assets/bg.jpg', '/brand/ai-data-logo', '/brand/bg']) {
      const r = await fetch(URL + p); assert.equal(r.status, 200, p);
    }
    const j = await (await fetch(URL + '/api/join')).json();
    assert.ok(j.svg.includes('<svg') && j.url.startsWith('http'), 'qr');
    assert.equal((await fetch(URL + '/api/export/feedback')).status, 401, 'export needs key');

    // 1. Check-in
    const users = [];
    for (let i = 0; i < 25; i++) {
      const s = await connect();
      assert.equal((await call(s, 'checkin', { name: 'x' })).ok, false, 'short name rejected');
      const r = await call(s, 'checkin', { name: `User.${i}@mservice.com.vn` });
      assert.ok(r.ok); s.uid = r.id; users.push(s);
    }
    await wait(300);
    assert.equal(pub.checkedIn, 25);
    // reconnect keeps identity
    const re = await connect();
    assert.ok((await call(re, 'hello', users[0].uid)).ok);
    re.close();

    // 2. Word cloud
    await act({ type: 'next' });
    assert.equal(pub.slide.type, 'wordcloud');
    const words = ['AI', 'ai', 'Networking', 'LLM', 'Agent', 'Data'];
    for (const [i, s] of users.entries()) await call(s, 'word:add', { slideId: 'wish', word: words[i % words.length] });
    assert.equal((await call(users[0], 'word:add', { slideId: 'wish', word: 'AI' })).ok, false, 'dup rejected');
    assert.equal((await call(users[1], 'word:add', { slideId: 'wish', word: 'vãi l' })).ok, false, 'profanity rejected');
    await wait(300);
    const ai = pub.words.find((w) => w.key === 'ai');
    assert.equal(ai.count, 9, 'case-insensitive merge');
    await act({ type: 'word:hide', slideId: 'wish', key: 'ai' });
    assert.ok(!pub.words.find((w) => w.key === 'ai'), 'hidden word');

    // 3. Poll
    await act({ type: 'next' });
    assert.equal(pub.slide.type, 'poll');
    assert.equal(pub.slide.options.length, 11);
    for (const [i, s] of users.entries()) assert.ok((await call(s, 'poll:vote', { slideId: 'topic-vote', option: i % 4 === 0 ? 2 : i % 11 })).ok);
    await call(users[1], 'poll:vote', { slideId: 'topic-vote', option: 2 }); // change vote
    await wait(300);
    assert.equal(pub.poll.total, 25, 'one vote per user');
    // hide results: screen + phones get no counts, admin still does
    const phone = await connect();
    await call(phone, 'hello', users[3].uid);
    let phoneState = null; phone.on('state', (st) => { phoneState = st; });
    await act({ type: 'poll:reveal', slideId: 'topic-vote' });
    assert.equal(pub.poll.hidden, true);
    assert.equal(pub.poll.counts, null, 'screen counts hidden');
    assert.equal(phoneState.poll.counts, null, 'phone counts hidden');
    assert.equal(adm.polls['topic-vote'].counts.reduce((a, b) => a + b, 0), 25, 'admin sees counts');
    await act({ type: 'poll:reveal', slideId: 'topic-vote' });
    assert.ok(Array.isArray(pub.poll.counts), 'revealed');
    // timer auto-closes voting
    await act({ type: 'poll:timer', slideId: 'topic-vote', seconds: 5 });
    assert.ok(pub.poll.endsIn > 3000 && pub.poll.open, 'timer running');
    await wait(5600);
    assert.equal(pub.poll.open, false, 'timer closed poll');
    assert.equal((await call(users[2], 'poll:vote', { slideId: 'topic-vote', option: 0 })).ok, false, 'closed poll');
    assert.equal(pub.poll.view, 'top3', 'closed poll shows top 3 by default');
    await act({ type: 'poll:view', slideId: 'topic-vote' });
    assert.equal(pub.poll.view, 'all', 'admin can switch to full results');
    await act({ type: 'poll:view', slideId: 'topic-vote' });
    await act({ type: 'poll:toggle', slideId: 'topic-vote' });
    assert.equal(pub.poll.open, true, 'reopened');
    await act({ type: 'poll:toggle', slideId: 'topic-vote' });
    phone.close();

    // 4. Sharing section
    await act({ type: 'next' }); assert.equal(pub.slide.title, 'Food of Thought');
    assert.ok(pub.slide.agenda.length >= 3, 'agenda shown');
    await act({ type: 'qr:toggle' }); assert.equal(pub.bigQr, true, 'full-screen QR on');
    await act({ type: 'qr:toggle' }); assert.equal(pub.bigQr, false, 'full-screen QR off');

    // 6. Q&A with moderation
    await act({ type: 'next' }); assert.equal(pub.slide.type, 'qa');
    for (let i = 0; i < 5; i++) assert.ok((await call(users[i], 'qa:ask', { text: `Question number ${i}?`, target: 'Chị Yên', anonymous: i === 0 })).ok);
    assert.ok((await call(users[6], 'qa:ask', { text: 'câu này vcl thật' })).ok, 'profane question accepted but held');
    await wait(300);
    assert.equal(pub.questions.length, 0, 'pending questions are not public');
    assert.equal(adm.questions.length, 6);
    assert.ok(adm.questions.find((q) => q.text.includes('vcl')).flagged, 'profane question flagged');
    assert.ok(!adm.questions.find((q) => q.text.startsWith('Question number 1')).flagged, 'clean question not flagged');
    const [q0, q1, q2] = adm.questions;
    await act({ type: 'qa:status', qid: q0.id, status: 'approved' });
    await act({ type: 'qa:status', qid: q1.id, status: 'approved' });
    await act({ type: 'qa:status', qid: q2.id, status: 'rejected' });
    assert.equal(pub.questions.length, 2);
    assert.equal(pub.questions.find((q) => q.id === q0.id).name, 'Ẩn danh');
    for (const s of users.slice(5, 12)) await call(s, 'qa:upvote', q1.id);
    assert.equal((await call(users[5], 'qa:upvote', q2.id)).ok, false, 'cannot upvote rejected');
    await wait(300);
    assert.equal(pub.questions[0].id, q1.id, 'sorted by upvotes');
    // organiser-added questions: straight to the live queue, or held for review
    await act({ type: 'qa:add', text: 'Câu hỏi từ ban tổ chức?' });
    assert.ok(pub.questions.find((q) => q.text === 'Câu hỏi từ ban tổ chức?'), 'admin question shown');
    await act({ type: 'qa:add', text: 'Câu hỏi chờ duyệt?', pending: true });
    assert.ok(!pub.questions.find((q) => q.text === 'Câu hỏi chờ duyệt?'), 'pending admin question hidden');
    assert.equal((await call(users[1], 'admin:action', { type: 'qa:add', text: 'hack' })).ok, false, 'audience cannot add as admin');
    // Google Sheet import (a local CSV stands in for the Form_Responses sheet)
    let csv = 'Timestamp,Câu hỏi của bạn,Bạn muốn câu hỏi được xử lý thế nào?\n'
      + '10/19/2026 17:00:24,"Chính sách hỗ trợ hội nghị, chi phí đi lại?",Cả hai\n'
      + '10/21/2026 8:17:42,"KPI năm 2026 của AI&Data là gì?",Trả lời trực tiếp trong buổi Town Hall\n'
      + '10/21/2026 9:00:00,Chỉ cần trả lời qua email,Trả lời qua email\n';
    const sheetSrv = http.createServer((req, res) => {
      if (req.url.startsWith('/private')) { res.setHeader('Content-Type', 'text/html'); return res.end('<html>login</html>'); }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.end(csv);
    }).listen(0);
    await new Promise((r) => sheetSrv.once('listening', r));
    const sheetUrl = `http://localhost:${sheetSrv.address().port}/sheet.csv`;
    await act({ type: 'sheet:config', url: sheetUrl, approve: false, auto: false });
    let r = await call(admin, 'admin:action', { type: 'sheet:sync' });
    assert.ok(r.ok && r.added === 2 && r.skipped === 1, 'imported 2, skipped email-only: ' + JSON.stringify(r));
    await wait(300);
    assert.equal(adm.questions.filter((q) => q.name === 'Google Form' && q.status === 'pending').length, 2, 'imported as pending');
    r = await call(admin, 'admin:action', { type: 'sheet:sync' });
    assert.equal(r.added, 0, 'no duplicates on re-sync');
    // a long form answer is kept whole (not cut at 300 chars)
    const longQ = 'Câu hỏi rất dài về chiến lược dữ liệu ' + 'và cách các team phối hợp '.repeat(20) + '— kết thúc ở đây?';
    csv += `10/22/2026 09:00:00,"${longQ}",Cả hai\n`;
    r = await call(admin, 'admin:action', { type: 'sheet:sync' });
    await wait(300);
    assert.ok(longQ.length > 300 && adm.questions.some((q) => q.text === longQ), 'long question imported in full');
    csv += '10/22/2026 10:00:00,"Câu hỏi mới từ form?",Cả hai\n';
    await act({ type: 'sheet:config', url: sheetUrl, approve: true, auto: false });
    r = await call(admin, 'admin:action', { type: 'sheet:sync' });
    assert.equal(r.added, 1, 'picks up new rows');
    await wait(300);
    assert.ok(pub.questions.find((q) => q.text === 'Câu hỏi mới từ form?'), 'approve-on-import goes live');
    await act({ type: 'sheet:config', url: sheetUrl.replace('/sheet.csv', '/private'), approve: false, auto: false });
    r = await call(admin, 'admin:action', { type: 'sheet:sync' });
    assert.ok(!r.ok && /chia sẻ/.test(r.error), 'private sheet explained');
    assert.equal((await call(users[2], 'admin:action', { type: 'sheet:sync' })).ok, false, 'audience cannot sync');
    sheetSrv.close();

    // Google login → private sheet via Sheets API
    assert.equal((await fetch(`${URL}/auth/google`, { redirect: 'manual' })).status, 401, 'login link needs admin key');
    const go = await fetch(`${URL}/auth/google?key=${KEY}`, { redirect: 'manual' });
    const loc = new globalThis.URL(go.headers.get('location'));
    assert.ok(loc.href.startsWith(`${G}/auth`) && loc.searchParams.get('scope').includes('spreadsheets.readonly'), 'redirects to Google consent');
    assert.ok(loc.searchParams.get('redirect_uri').endsWith('/auth/google/callback'));
    const st = loc.searchParams.get('state');
    const cbk = await fetch(`${URL}/auth/google/callback?code=good&state=${st}`, { redirect: 'manual' });
    assert.equal(cbk.headers.get('location'), '/admin?google=ok', 'callback ok');
    const replay = await fetch(`${URL}/auth/google/callback?code=good&state=${st}`, { redirect: 'manual' });
    assert.equal(replay.headers.get('location'), '/admin?google=expired', 'state is single use');
    await wait(300);
    assert.ok(adm.google.connected && adm.google.email === 'nghia@example.com', 'admin sees Google account');
    assert.ok(!JSON.stringify(adm).includes('rt1') && !JSON.stringify(pub).includes('at1'), 'tokens never leave the server');
    await act({ type: 'sheet:config', url: 'https://docs.google.com/spreadsheets/d/PRIVATEID/edit?resourcekey=&gid=2088885041#gid=2088885041', approve: false, auto: false });
    r = await call(admin, 'admin:action', { type: 'sheet:sync' }); // access token expires_in:1 → refresh path
    assert.ok(r.ok && r.added === 1, 'private sheet imported via OAuth: ' + JSON.stringify(r));
    await act({ type: 'google:logout' });
    assert.equal(adm.google.connected, false, 'logout');
    fakeGoogle.close();

    // MC page: limited role — can pick/answer questions, cannot drive slides or reset
    const mc = await connect();
    assert.equal((await call(mc, 'admin:auth', 'mc-key')).role, 'mc');
    const mcAct = (a) => call(mc, 'admin:action', a);
    assert.ok((await mcAct({ type: 'qa:highlight', qid: q1.id })).ok, 'mc picks a question');
    await wait(250);
    assert.equal(pub.questions[0].id, q1.id, 'picked question on screen');
    assert.ok((await mcAct({ type: 'qa:next' })).ok, 'mc next');
    await wait(250);
    assert.equal(adm.questions.find((q) => q.id === q1.id).status, 'answered', 'previous marked answered');
    assert.ok(pub.questions.find((q) => q.highlighted && q.id !== q1.id), 'next question highlighted');
    assert.equal((await mcAct({ type: 'next' })).ok, false, 'mc cannot change slides');
    assert.equal((await mcAct({ type: 'reset:all', confirm: 'RESET' })).ok, false, 'mc cannot reset');
    assert.equal((await mcAct({ type: 'qa:status', qid: q2.id, status: 'rejected' })).ok, false, 'mc cannot reject');
    assert.equal((await mcAct({ type: 'goto', index: 0 })).ok, false, 'mc can only open the Q&A slide');
    assert.ok((await mcAct({ type: 'goto', index: pub.slides.findIndex((x) => x.type === 'qa') })).ok, 'mc opens Q&A slide');
    // topic groups + MC timers
    await wait(250);
    assert.ok(adm.questions.find((q) => q.id === q1.id).answerMs > 0, 'answer time recorded');
    assert.ok(pub.questions.find((q) => q.highlighted).highlightedAt > 0, 'answer clock running');
    assert.ok(pub.slideStartedAt > 0 && pub.programStartedAt > 0 && pub.now > 0, 'slide/programme clocks');
    assert.ok(pub.questions.every((q) => ['fun', 'okr', 'hard'].includes(q.category)), 'every question has a group');
    assert.ok((await mcAct({ type: 'qa:category', qid: q2.id, category: 'hard' })).ok, 'mc changes group');
    assert.equal((await mcAct({ type: 'qa:category', qid: q2.id, category: 'nope' })).ok, true);
    await wait(250);
    assert.equal(adm.questions.find((q) => q.id === q2.id).category, 'hard', 'invalid group ignored, manual group kept');
    assert.ok((await mcAct({ type: 'timer:program', reset: true })).ok);
    await wait(250);
    assert.equal(pub.programStartedAt, 0, 'mc resets programme clock');
    mc.close();
    await act({ type: 'qa:status', qid: q1.id, status: 'approved' });
    const lit = adm.questions.find((q) => q.highlighted);
    if (lit) await act({ type: 'qa:highlight', qid: lit.id }); // clear what the MC put up
    await act({ type: 'qa:highlight', qid: q0.id });
    assert.equal(pub.questions[0].id, q0.id, 'highlight first');

    // 7. Duck race
    await act({ type: 'next' }); assert.equal(pub.slide.type, 'race');
    for (const s of users.slice(0, 10)) assert.ok((await call(s, 'race:join')).ok);
    assert.ok((await call(users[0], 'race:color', '#FF6FB5')).ok, 'pick duck colour');
    assert.equal((await call(users[0], 'race:color', 'red; x')).ok, false, 'only palette colours');
    await act({ type: 'race:start' });
    assert.equal(pub.race.phase, 'countdown');
    await wait(3700);
    assert.equal(pub.race.phase, 'racing');
    // users[0] taps hardest, users[9] never taps
    const tappers = setInterval(() => users.slice(0, 9).forEach((s, i) => s.emit('race:tap', i === 0 ? 2 : 1)), 100);
    for (let i = 0; i < 300 && pub.race.phase !== 'finished'; i++) await wait(100);
    clearInterval(tappers);
    assert.equal(pub.race.phase, 'finished', 'race finished');
    assert.equal(pub.race.finishOrder[0].name, 'user.0', 'fastest tapper wins');
    assert.equal(pub.race.finishOrder.at(-1).name, 'user.9', 'idle duck last');
    await act({ type: 'race:rematch' });
    assert.equal(pub.race.phase, 'lobby');
    assert.equal(pub.race.playerCount, 10, 'rematch keeps players');

    // 8. Feedback
    await act({ type: 'next' }); assert.equal(pub.slide.type, 'feedback');
    assert.equal((await call(users[0], 'feedback:submit', { overall: 0 })).ok, false, 'rating required');
    for (const [i, s] of users.slice(0, 4).entries()) assert.ok((await call(s, 'feedback:submit', { overall: 5 - (i % 2), content: 4, organization: 5, suggestion: 'More demos' })).ok);
    await wait(300);
    assert.equal(pub.feedback.count, 4);
    assert.equal(pub.feedback.overall, 4.5);

    // exports
    for (const w of ['checkins', 'words', 'votes', 'questions', 'race', 'feedback']) {
      const r = await fetch(`${URL}/api/export/${w}?key=${KEY}`);
      assert.equal(r.status, 200, w);
      assert.ok((await r.text()).split('\n').length > 1, w + ' has rows');
    }
    // branding upload
    const png = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'bg.jpg'));
    assert.equal((await fetch(`${URL}/api/brand/bg`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: png })).status, 401, 'brand needs key');
    assert.equal((await fetch(`${URL}/api/brand/ai-data-logo?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: png })).status, 200);
    const got = await fetch(`${URL}/brand/ai-data-logo`);
    assert.equal(got.headers.get('content-type'), 'image/jpeg', 'uploaded logo served');
    assert.equal((await fetch(`${URL}/api/brand/ai-data-logo?key=${KEY}`, { method: 'DELETE' })).status, 200);
    assert.ok((await fetch(`${URL}/brand/ai-data-logo`)).headers.get('content-type').includes('png'), 'default restored');

    // slide text edits: live on screen + phones, survive reset:all, revert to config.json
    const rev0 = pub.rev;
    assert.equal((await call(admin, 'admin:action', { type: 'content:save', slideId: 'topic-vote', fields: { title: '' } })).ok, false, 'empty title rejected');
    assert.equal((await call(admin, 'admin:action', { type: 'content:save', slideId: 'topic-vote', fields: { options: ['only one'] } })).ok, false, 'poll needs 2 options');
    await act({ type: 'content:save', slideId: 'topic-vote', fields: { title: 'Vote mới', subtitle: 'Mô tả mới', options: ['A', 'B', 'C'] } });
    await act({ type: 'content:save', slideId: 'food-of-thought', fields: { agenda: [{ title: 'X', items: ['x1', '', 'x2'] }] } });
    await act({ type: 'content:save', event: { eventTitle: 'Townhall 2026' } });
    assert.ok(pub.rev > rev0, 'rev bumps so clients rebuild');
    assert.equal(pub.slides.find((x) => x.id === 'topic-vote').title, 'Vote mới');
    assert.equal(pub.eventTitle, 'Townhall 2026');
    await act({ type: 'goto', index: 2 });
    let phone0 = null; users[0].on('state', (st) => { phone0 = st; });
    await act({ type: 'poll:toggle', slideId: 'topic-vote' }); await act({ type: 'poll:toggle', slideId: 'topic-vote' });
    assert.deepEqual(phone0.slide.options, ['A', 'B', 'C'], 'phones get edited options');
    assert.ok(Object.values(adm.polls['topic-vote'].counts).length === 3, 'results follow the new option list');
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'content.json'), 'utf8'));
    assert.deepEqual(saved.slides['food-of-thought'].agenda, [{ title: 'X', items: ['x1', 'x2'] }], 'edits written to the data volume');
    await act({ type: 'reset:all', confirm: 'RESET' });
    assert.equal(pub.slides.find((x) => x.id === 'topic-vote').title, 'Vote mới', 'reset keeps edited text');
    await act({ type: 'content:revert', slideId: 'topic-vote' });
    await act({ type: 'content:revert', event: true });
    assert.equal(pub.slides.find((x) => x.id === 'topic-vote').title, 'Vote chủ đề sharing bạn yêu thích nhất', 'revert to config');
    assert.equal(pub.eventTitle, 'Townhall AI & Data');

    console.log('✅ smoke test passed');
    users.forEach((s) => s.close()); admin.close();
  } catch (e) {
    failed = true;
    console.error('❌', e);
  } finally {
    srv.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
  }
})();

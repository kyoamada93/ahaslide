// End-to-end test: boots the server on a temp port/data dir and drives the whole program with fake users.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { io } = require('socket.io-client');

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const KEY = 'test-key';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, ...args) => new Promise((r) => s.emit(ev, ...args, r));

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, ADMIN_KEY: KEY, DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'inherit'] });
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
    for (const p of ['/', '/screen', '/admin', '/moderator', '/vendor/wordcloud2.js', '/assets/bg.jpg', '/brand/ai-data-logo', '/brand/bg']) {
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
      const r = await call(s, 'checkin', { name: `User ${i}`, team: 'Team ' + (i % 3) });
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
    await act({ type: 'poll:toggle', slideId: 'topic-vote' });
    assert.equal((await call(users[2], 'poll:vote', { slideId: 'topic-vote', option: 0 })).ok, false, 'closed poll');

    // 4-5. Speakers
    await act({ type: 'next' }); assert.equal(pub.slide.speaker, 'Anh Dũng');
    await act({ type: 'next' }); assert.equal(pub.slide.speaker, 'Chị Yên');

    // 6. Q&A with moderation
    await act({ type: 'next' }); assert.equal(pub.slide.type, 'qa');
    for (let i = 0; i < 5; i++) assert.ok((await call(users[i], 'qa:ask', { text: `Question number ${i}?`, target: 'Chị Yên', anonymous: i === 0 })).ok);
    await wait(300);
    assert.equal(pub.questions.length, 0, 'pending questions are not public');
    assert.equal(adm.questions.length, 5);
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
    await act({ type: 'qa:highlight', qid: q0.id });
    assert.equal(pub.questions[0].id, q0.id, 'highlight first');

    // 7. Duck race
    await act({ type: 'next' }); assert.equal(pub.slide.type, 'race');
    for (const s of users.slice(0, 10)) assert.ok((await call(s, 'race:join')).ok);
    await act({ type: 'race:start' });
    assert.equal(pub.race.phase, 'countdown');
    await wait(3700);
    assert.equal(pub.race.phase, 'racing');
    // users[0] taps hardest, users[9] never taps
    const tappers = setInterval(() => users.slice(0, 9).forEach((s, i) => s.emit('race:tap', i === 0 ? 2 : 1)), 100);
    for (let i = 0; i < 300 && pub.race.phase !== 'finished'; i++) await wait(100);
    clearInterval(tappers);
    assert.equal(pub.race.phase, 'finished', 'race finished');
    assert.equal(pub.race.finishOrder[0].name, 'User 0', 'fastest tapper wins');
    assert.equal(pub.race.finishOrder.at(-1).name, 'User 9', 'idle duck last');
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
    assert.ok((await fetch(`${URL}/brand/ai-data-logo`)).headers.get('content-type').includes('svg'), 'default restored');

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

// Visual check: walks through all slides with bots connected and screenshots screen + phone views.
// Usage: node scripts/screenshots.js <outDir>   (server must be running on :3000 with default key)
const path = require('path');
const { chromium } = require('playwright');
const { io } = require('socket.io-client');

const OUT = process.argv[2] || 'shots';
const KEY = process.env.ADMIN_KEY || 'momo-aidata';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const admin = io('http://localhost:3000', { transports: ['websocket'] });
  await new Promise((r) => admin.on('connect', r));
  await new Promise((r) => admin.emit('admin:auth', KEY, r));
  let A = null; admin.on('admin', (a) => { A = a; });
  const act = (a) => new Promise((r) => admin.emit('admin:action', a, r));

  const browser = await chromium.launch();
  const screen = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await screen.goto('http://localhost:3000/screen');
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await phone.goto('http://localhost:3000/');
  await wait(800);
  await phone.screenshot({ path: path.join(OUT, 'phone-0-checkin-form.png') });
  await phone.fill('#ciName', 'nghia.tran');
  await phone.click('[data-act=checkin]');
  await wait(800);

  const slides = ['checkin', 'wordcloud', 'poll', 'section', 'qa', 'race', 'feedback'];
  for (let i = 0; i < slides.length; i++) {
    await act({ type: 'goto', index: i });
    await wait(6000);
    if (slides[i] === 'poll') await phone.click('.opt[data-i="2"]');
    if (slides[i] === 'qa') {
      const pend = A.questions.filter((q) => q.status === 'pending');
      for (const q of pend.slice(0, 5)) await act({ type: 'qa:status', qid: q.id, status: 'approved' });
      await wait(1500);
      await screen.screenshot({ path: path.join(OUT, 'screen-4a-qa-no-pick.png') });
      if (pend[0]) await act({ type: 'qa:highlight', qid: pend[0].id });
      await wait(1500);
    }
    if (slides[i] === 'race') {
      await phone.click('[data-act=race-join]');
      await wait(1500);
      await screen.screenshot({ path: path.join(OUT, 'screen-6a-race-lobby.png') });
      await act({ type: 'race:start' });
      await wait(1500);
      await phone.screenshot({ path: path.join(OUT, 'phone-6b-countdown.png') });
      await wait(5000);
      for (let k = 0; k < 20; k++) { await phone.tap('.tap-zone'); await wait(60); }
      await screen.screenshot({ path: path.join(OUT, 'screen-6b-racing.png') });
      await phone.screenshot({ path: path.join(OUT, 'phone-6c-racing.png') });
      for (let k = 0; k < 60 && A.race.phase !== 'finished'; k++) await wait(500);
      await wait(1500);
    }
    await screen.screenshot({ path: path.join(OUT, `screen-${i}-${slides[i]}.png`) });
    await phone.screenshot({ path: path.join(OUT, `phone-${i}-${slides[i]}.png`), fullPage: true });
  }
  const adm = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await adm.goto('http://localhost:3000/admin?key=' + KEY);
  await wait(2500);
  await adm.screenshot({ path: path.join(OUT, 'admin.png') });
  const mod = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await act({ type: 'goto', index: 4 });
  await mod.goto('http://localhost:3000/moderator?key=' + KEY);
  await wait(1500);
  await mod.screenshot({ path: path.join(OUT, 'moderator.png') });
  await browser.close();
  admin.close();
  process.exit(0);
})();

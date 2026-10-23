(() => {
  const { socket, $, esc, drawDuck } = TH;
  const stage = $('#stage');
  const params = new URLSearchParams(location.search);
  const adminKey = params.get('key');
  let S = null; // latest public state
  let renderedSlideId = null;
  let join = { url: '', svg: '' };

  const morph = TownhallMorph.create(stage);
  const backdrop = $('.bg');

  // Keep the projector laptop from dimming or sleeping mid-event (needs https or localhost).
  let wakeLock = null;
  async function keepAwake() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {}
  }
  keepAwake();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });
  addEventListener('click', keepAwake);
  socket.on('connect', () => {
    socket.emit('screen:join');
    if (adminKey) socket.emit('admin:auth', adminKey, () => {});
  });

  fetch('/api/join').then((r) => r.json()).then((j) => { join = j; $('#miniQr').innerHTML = j.svg; $('#miniUrl').textContent = j.url.replace(/^https?:\/\//, ''); if (S) update(); });

  // Keyboard: F = fullscreen; arrows / PageUp / PageDown / space (clickers) when ?key= given.
  addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); return; }
    if (!adminKey) return;
    if (['ArrowRight', 'PageDown', ' ', 'ArrowDown'].includes(e.key)) { socket.emit('admin:action', { type: 'next' }); e.preventDefault(); }
    if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { socket.emit('admin:action', { type: 'prev' }); e.preventDefault(); }
  });
  if (!adminKey) $('#hint').textContent = 'F: toàn màn hình';
  else $('#hint').textContent = 'F: toàn màn hình · ← → / clicker: chuyển slide';

  socket.on('state', (s) => { if (!s.slides) return; // ignore the slim phone state sent before screen:join
    if (s.poll) s.poll.localEnd = s.poll.endsIn ? Date.now() + s.poll.endsIn : 0;
    if (s.race) s.race.localEnd = Date.now() + s.race.countdownLeft; S = s; update(); });
  socket.on('reset', () => location.reload());

  function update() {
    const slide = S.slide;
    $('#checkedCount').textContent = S.checkedIn;
    $('#miniJoin').classList.toggle('hidden', slide.type === 'checkin' || slide.type === 'feedback');
    $('#dots').innerHTML = S.slides.map((_, i) => `<span class="${i === S.slideIndex ? 'on' : i < S.slideIndex ? 'done' : ''}"></span>`).join('');
    if (renderedSlideId !== slide.id) {
      const previous = morph.capture();
      renderedSlideId = slide.id;
      backdrop.dataset.scene = slide.type;
      stopRace();
      clearTimeout(cloudTimer);
      if (typeof WordCloud === 'function') WordCloud.stop?.();
      stage.innerHTML = '';
      const el = document.createElement('section');
      el.className = 'slide ' + slide.type;
      stage.appendChild(el);
      (builders[slide.type] || builders.unknown)(el, slide);
      (updaters[slide.type] || (() => {}))(el, slide);
      morph.play(previous);
      return;
    }
    (updaters[slide.type] || (() => {}))(stage.firstChild, slide);
  }

  const builders = {
    checkin(el, sl) {
      el.innerHTML = `
        <div class="left">
          <div class="kicker">${esc(S.eventSubtitle)}</div>
          <h1>${esc(sl.title)}</h1>
          <p class="sub">${esc(sl.subtitle)}</p>
          <div class="big-count" id="bigCount">0</div>
          <div class="muted" style="font-size:24px">người đã check-in</div>
          <div class="names" id="names"></div>
        </div>
        <div class="qr-card glass">
          <div class="qr-box" id="bigQr"></div>
          <div class="qr-url" id="bigUrl"></div>
        </div>`;
    },
    wordcloud(el, sl) {
      el.innerHTML = `<h1>${esc(sl.title)}</h1><p class="sub">${esc(sl.subtitle || '')}</p>
        <div class="cloud-wrap"><canvas id="cloud"></canvas><div class="empty" id="cloudEmpty">Đang chờ từ khoá đầu tiên… ✨</div><div class="meta" id="cloudMeta"></div></div>`;
      lastCloudKey = '';
    },
    poll(el, sl) {
      el.innerHTML = `<h1>${esc(sl.title)}</h1><p class="sub">${esc(sl.subtitle || '')}</p><div class="poll-status" id="pollStatus"></div>
        <div class="poll-box glass" id="poll">${sl.options.map((o, i) => `
          <div class="opt" data-i="${i}"><div class="num">${i + 1}</div>
            <div class="bar-wrap"><div class="bar" style="width:0"></div><div class="label">${esc(o)}</div></div>
            <div class="val"><span class="c">0</span><small class="p">0%</small></div></div>`).join('')}</div>`;
    },
    speaker(el, sl) {
      const initial = (sl.speaker || '?').split(' ').pop().charAt(0);
      const intro = `
        <div class="kicker">${esc(sl.title || 'Sharing')}</div>
        <div class="avatar">${sl.photo ? `<img src="${esc(sl.photo)}" alt="">` : esc(initial)}</div>
        <h1>${esc(sl.speaker)}</h1>
        <div class="topic">${esc(sl.topic || '')}</div>
        <div class="muted" style="font-size:22px">${esc(sl.role || '')}</div>
        <div class="ask glass">💬 Gửi câu hỏi cho ${esc(sl.speaker)} ngay trên điện thoại</div>`;
      if (!sl.agenda?.length) { el.innerHTML = intro; return; }
      el.classList.add('with-agenda');
      el.innerHTML = `<div class="sp-intro">${intro}</div>
        <div class="agenda glass">${sl.agenda.map((a, i) => `
          <div class="ag"><div class="ag-n">${i + 1}</div><div><div class="ag-t">${esc(a.title)}</div>
            <ul>${(a.items || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`).join('')}</div>`;
    },
    qa(el, sl) {
      el.innerHTML = `<h1>${esc(sl.title)}</h1><p class="sub">${esc(sl.subtitle || '')}</p>
        <div class="qa-grid"><div class="feature glass" id="qaFeature"></div><div class="list" id="qaList"></div></div>`;
    },
    race(el, sl) {
      el.innerHTML = `<div class="row" style="justify-content:space-between;align-items:flex-end"><div><h1>🦆 ${esc(sl.title)}</h1><p class="sub">${esc(sl.subtitle || '')}</p></div></div>
        <div class="race-stage"><canvas id="river"></canvas>
          <div class="timer glass hidden" id="raceTimer"></div>
          <div class="board glass hidden" id="raceBoard"></div>
          <div class="race-map glass hidden" id="raceMap"><span class="flag s">START</span><div class="track"><div class="dots"></div></div><span class="flag f">🏁</span></div>
          <div class="race-overlay" id="raceOverlay"></div></div>`;
      startRace();
    },
    feedback(el, sl) {
      el.innerHTML = `
        <div class="left">
          <div class="kicker">${esc(S.eventTitle)}</div>
          <h1>${esc(sl.title)}</h1>
          <p class="sub">${esc(sl.subtitle || '')}</p>
          <div class="stats">
            <div class="stat glass"><b id="fbCount">0</b><span>lượt đánh giá</span></div>
            <div class="stat glass"><b id="fbAvg">–</b><span class="stars" id="fbStars"></span><br><span>điểm trung bình</span></div>
          </div>
        </div>
        <div class="qr-card glass" style="flex:.8;display:flex;flex-direction:column;align-items:center;padding:28px">
          <div style="font-size:26px;font-weight:800;margin-bottom:16px">📝 Quét để đánh giá & góp ý</div>
          <div class="qr-box" id="bigQr"></div>
          <div class="qr-url" id="bigUrl"></div>
        </div>`;
    },
    unknown(el, sl) { el.innerHTML = `<h1>${esc(sl.title || '')}</h1>`; },
  };

  function fillBigQr(el) {
    const q = $('#bigQr', el);
    if (q && join.svg && !q.innerHTML) { q.innerHTML = join.svg; $('#bigUrl', el).textContent = join.url.replace(/^https?:\/\//, ''); }
  }

  let lastCloudKey = '';
  let cloudTimer = null;
  const updaters = {
    checkin(el) {
      fillBigQr(el);
      $('#bigCount', el).textContent = S.checkedIn;
      const box = $('#names', el);
      const have = new Set([...box.children].map((c) => c.textContent));
      const want = S.recentNames.slice(0, 24);
      if (want.join('|') !== [...box.children].map((c) => c.textContent).join('|')) {
        box.innerHTML = want.map((n) => `<span style="${have.has(n) ? 'animation:none' : ''}">${esc(n)}</span>`).join('');
      }
    },
    wordcloud(el) {
      const words = S.words || [];
      $('#cloudEmpty', el).classList.toggle('hidden', words.length > 0);
      $('#cloudMeta', el).textContent = words.length ? `${words.reduce((a, w) => a + w.count, 0)} lượt gửi · ${words.length} từ khoá` : '';
      const key = words.map((w) => w.key + w.count).join('|');
      if (key === lastCloudKey) return;
      lastCloudKey = key;
      clearTimeout(cloudTimer);
      cloudTimer = setTimeout(() => drawCloud(words), 400);
    },
    poll(el) {
      const { counts, total, open, hidden } = S.poll;
      const shownCounts = counts || S.slide.options.map(() => 0);
      const max = Math.max(...shownCounts, 1);
      pollStatus(el);
      el.classList.toggle('results-hidden', !!hidden);
      el.querySelectorAll('.opt').forEach((row, i) => {
        const c = shownCounts[i];
        row.querySelector('.bar').style.width = (total ? (c / max) * 100 : 0) + '%';
        row.querySelector('.c').textContent = c;
        row.querySelector('.p').textContent = total ? Math.round((c / total) * 100) + '%' : '0%';
        row.classList.toggle('lead', c > 0 && c === max);
      });
    },
    qa(el) {
      const qs = S.questions;
      const feat = qs.find((q) => q.highlighted) || qs.find((q) => q.status === 'approved');
      $('#qaFeature', el).innerHTML = feat
        ? `<div class="kicker">${feat.highlighted ? '🎤 Đang trả lời' : '🔥 Top câu hỏi'}${feat.target ? ' · ' + esc(feat.target) : ''}</div><div class="q">“${esc(feat.text)}”</div><div class="who">— Câu hỏi ẩn danh · ▲ ${feat.upvotes}</div>`
        : `<div class="q" style="opacity:.7">Chưa có câu hỏi nào được duyệt.<br>Hãy gửi câu hỏi từ điện thoại nhé! 📱</div>`;
      const rest = qs.filter((q) => q !== feat).slice(0, 7);
      $('#qaList', el).innerHTML = rest.map((q) => `
        <div class="item glass ${q.status}"><div><div class="t">${esc(q.text)}</div><div class="by">${q.target ? '→ ' + esc(q.target) : 'Ẩn danh'}${q.status === 'answered' ? ' · ✅ đã trả lời' : ''}</div></div><div class="votes">▲ ${q.upvotes}</div></div>`).join('');
    },
    race(el) { raceState(S.race); },
    feedback(el) {
      fillBigQr(el);
      const f = S.feedback;
      $('#fbCount', el).textContent = f.count;
      $('#fbAvg', el).textContent = f.count ? f.overall.toFixed(1) : '–';
      $('#fbStars', el).textContent = f.count ? '★'.repeat(Math.round(f.overall)) + '☆'.repeat(5 - Math.round(f.overall)) : '';
    },
  };

  // Vote status line: open/closed, ballots, hidden results and the auto-close countdown.
  function pollStatus(el) {
    const p = S.poll;
    const left = p.localEnd ? Math.max(0, Math.ceil((p.localEnd - Date.now()) / 1000)) : 0;
    const timer = p.open && left ? ` · <span class="poll-timer${left <= 10 ? ' urgent' : ''}">⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>` : '';
    $('#pollStatus', el).innerHTML = `${p.open ? '🟢 Đang mở vote' : '🔒 Đã đóng vote'} · <b>${p.total}</b> phiếu${p.hidden ? ' · 🙈 Kết quả sẽ công bố sau' : ''}${timer}`;
  }
  setInterval(() => { if (S?.slide.type === 'poll' && S.poll.localEnd && stage.firstChild) pollStatus(stage.firstChild); }, 250);

  function drawCloud(words) {
    const canvas = $('#cloud');
    if (!canvas || !words.length || typeof WordCloud !== 'function') return;
    const r = canvas.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    const max = words[0].count;
    const area = canvas.width * canvas.height;
    const base = Math.sqrt(area / Math.max(12, words.length * 2.2));
    const palette = ['#a50064', '#1261b5', '#753154', '#cc267d', '#254a84', '#9a4171', '#3b2351'];
    // Weights are font sizes in px; wordcloud2's shrinkToFit scales them down until a word fits.
    const size = (c) => Math.max(16 * dpr, Math.min(base * 1.1, base * (0.35 + 0.75 * (c / max))));
    const sizeToCount = new Map();
    WordCloud.stop?.();
    WordCloud(canvas, {
      list: words.map((w) => { const px = size(w.count); sizeToCount.set(w.text, w.count); return [w.text, px]; }),
      weightFactor: 1, minSize: 6 * dpr,
      fontFamily: '"Be Vietnam Pro", "Segoe UI", sans-serif',
      fontWeight: (w) => ((sizeToCount.get(w) || 0) >= max * 0.6 ? 900 : 700),
      color: (w) => { const c = sizeToCount.get(w) || 0; return c === max ? '#a50064' : palette[(w.length + c) % palette.length]; },
      backgroundColor: 'rgba(0,0,0,0)',
      rotateRatio: 0.15, rotationSteps: 2, gridSize: Math.round(8 * dpr), shrinkToFit: true, drawOutOfBound: false,
      shape: 'ellipse', ellipticity: 0.55,
    });
  }

  // ------------------------------------------------------------ race view
  let scene = null;
  let lastRace = null;
  let confettiDone = false;
  let hudTimer = null;
  let raceT = 0;
  socket.on('race:frame', (f) => { raceT = f.t; if (scene) scene.setFrame(f); });

  function startRace() {
    confettiDone = false;
    scene = RaceScene.create($('#river'));
    scene.start();
    socket.emit('screen:join'); // ask for a fresh frame
    clearInterval(hudTimer);
    hudTimer = setInterval(hud, 200);
  }
  function stopRace() { if (scene) scene.stop(); scene = null; lastRace = null; clearInterval(hudTimer); clearInterval(cdTimer); }

  // Leaderboard, timer and mini-map over the river.
  function hud() {
    if (!scene || !S || S.slide.type !== 'race') return;
    const racing = S.race.phase === 'racing';
    const st = scene.standings();
    const board = $('#raceBoard'), timer = $('#raceTimer'), map = $('#raceMap');
    board.classList.toggle('hidden', !racing);
    timer.classList.toggle('hidden', !racing);
    map.classList.toggle('hidden', S.race.phase === 'lobby' || !st.length);
    if (racing) {
      board.innerHTML = '<h3>Dẫn đầu</h3>' + st.slice(0, 5).map((d, i) => `<div class="r"><b class="pos">${i + 1}</b><i style="background:${d.color}">${d.no}</i><span>${esc(d.name)}</span><em>${Math.round(d.p)}%</em></div>`).join('');
      timer.textContent = '⏱ ' + Math.max(0, raceT / 1000).toFixed(1) + 's';
    }
    if (!map.classList.contains('hidden')) {
      const top = new Set(st.slice(0, 3).map((d) => d.id));
      map.querySelector('.dots').innerHTML = st.slice().reverse().map((d) => `<i class="${top.has(d.id) ? 'lead' : ''}" style="left:${d.p}%;background:${d.color}"></i>`).join('');
    }
  }

  let cdTimer = null;
  function raceState(r) {
    const ov = $('#raceOverlay');
    if (!ov) return;
    const sig = r.phase + r.playerCount + r.finishOrder.length;
    if (lastRace === sig && r.phase !== 'lobby') return;
    lastRace = sig;
    clearInterval(cdTimer);
    ov.classList.toggle('dim', r.phase === 'finished' || r.phase === 'lobby');
    if (r.phase === 'lobby') {
      confettiDone = false;
      if (scene) scene.reset();
      ov.innerHTML = `<div class="lobby">
          <div class="lobby-qr">${join.svg}</div>
          <div class="lobby-txt"><div class="big">${r.playerCount}</div><div class="lbl">chú vịt đã xuống nước 🦆</div>
          <div class="how">📱 Quét QR → bấm <b>“Tham gia đua”</b><br>👆 Khi có hiệu lệnh: <b>tap liên tục</b> để vịt bơi nhanh!</div></div></div>`;
    } else if (r.phase === 'countdown') {
      let shownLeft = null;
      const draw = () => {
        const left = Math.max(0, Math.ceil((r.localEnd - Date.now()) / 1000));
        if (left === shownLeft) return;
        shownLeft = left;
        const lit = left >= 3 ? 1 : left === 2 ? 2 : 3;
        ov.innerHTML = `<div class="lights glass">${[0, 1, 2].map((i) => `<span class="${left === 0 ? 'go' : i < lit ? 'on' : ''}"></span>`).join('')}</div>
          <div class="countdown">${left > 0 ? left : 'GO!'}</div>`;
      };
      draw(); cdTimer = setInterval(draw, 100);
    } else if (r.phase === 'racing') {
      ov.innerHTML = '';
    } else if (r.phase === 'finished') {
      const [a, b, c] = r.finishOrder;
      const block = (p, k) => p ? `<div class="p p${k}"><canvas width="240" height="170" data-color="${p.color}" data-no="${p.no || ''}"></canvas><div class="name">${esc(p.name)}</div><div class="block">${k}</div></div>` : '';
      ov.innerHTML = `<div class="win-title">🏆 Chúc mừng nhà vô địch!</div>
        <div class="podium">${block(b, 2)}${block(a, 1)}${block(c, 3)}</div>`;
      ov.querySelectorAll('.podium canvas').forEach((cv, i) => {
        const ctx = cv.getContext('2d');
        let t = i;
        (function f() {
          if (!cv.isConnected) return;
          ctx.clearRect(0, 0, 240, 170);
          drawDuck(ctx, 115, 110, 58, cv.dataset.color, { bob: t += 0.1, no: Number(cv.dataset.no) });
          requestAnimationFrame(f);
        })();
      });
      if (!confettiDone) { confettiDone = true; confetti(); }
    }
  }
  setInterval(() => { if (S && S.slide.type === 'race' && S.race.phase === 'lobby') { lastRace = null; raceState(S.race); } }, 1500);

  function confetti() {
    const c = document.createElement('canvas');
    c.className = 'confetti'; document.body.appendChild(c);
    const ctx = c.getContext('2d');
    c.width = innerWidth; c.height = innerHeight;
    const colors = ['#ff6fb5', '#ffd43b', '#fff', '#a50064', '#4dd0e1', '#9ccc65'];
    const ps = Array.from({ length: 220 }, () => ({ x: Math.random() * c.width, y: -Math.random() * c.height, vx: (Math.random() - .5) * 4, vy: 2 + Math.random() * 4, r: Math.random() * 6, a: Math.random() * 6, col: colors[(Math.random() * colors.length) | 0] }));
    let t = 0;
    (function f() {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of ps) { p.x += p.vx; p.y += p.vy; p.a += .1; ctx.fillStyle = p.col; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); }
      if (++t < 360) requestAnimationFrame(f); else c.remove();
    })();
  }
})();

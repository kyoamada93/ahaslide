(() => {
  const { socket, $, esc, particles, drawDuck } = TH;
  const stage = $('#stage');
  const params = new URLSearchParams(location.search);
  const adminKey = params.get('key');
  let S = null; // latest public state
  let renderedSlideId = null;
  let join = { url: '', svg: '' };

  // Soft floating sparkles over the branded background.
  particles($('#fx'), 36, { dot: 'rgba(255,255,255,.85)', line: '255,255,255', lineAlpha: 0.18 });

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

  fetch('/api/join').then((r) => r.json()).then((j) => {
    join = j;
    const host = j.url.replace(/^https?:\/\//, '');
    $('#miniQr').innerHTML = j.svg; $('#miniUrl').textContent = host;
    $('#qrOverlayCode').innerHTML = j.svg; $('#qrOverlayUrl').textContent = host;
    if (S) update();
  });

  // Keyboard: F = fullscreen; arrows / PageUp / PageDown / space (clickers) when ?key= given.
  addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); return; }
    if (!adminKey) return;
    if (e.key === 'q' || e.key === 'Q') { socket.emit('admin:action', { type: 'qr:toggle' }); return; }
    if (['ArrowRight', 'PageDown', ' ', 'ArrowDown'].includes(e.key)) { socket.emit('admin:action', { type: 'next' }); e.preventDefault(); }
    if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { socket.emit('admin:action', { type: 'prev' }); e.preventDefault(); }
  });
  if (!adminKey) $('#hint').textContent = 'F: toàn màn hình';
  else $('#hint').textContent = 'F: toàn màn hình · ← → / clicker: chuyển slide · Q: QR to';

  socket.on('state', (s) => { if (!s.slides) return; // ignore the slim phone state sent before screen:join
    if (s.poll) s.poll.localEnd = s.poll.endsIn ? Date.now() + s.poll.endsIn : 0;
    if (s.race) s.race.localEnd = Date.now() + s.race.countdownLeft; S = s; update(); });
  socket.on('reset', () => location.reload());

  // Slides with their own big QR (or a race in progress) hide the side QR.
  const OWN_QR = new Set(['checkin', 'feedback', 'race']);

  function update() {
    const slide = S.slide;
    $('#checkedCount').textContent = S.checkedIn;
    $('#qrOverlay').classList.toggle('hidden', !S.bigQr);
    $('#dots').innerHTML = S.slides.map((_, i) => `<span class="${i === S.slideIndex ? 'on' : i < S.slideIndex ? 'done' : ''}"></span>`).join('');
    if (renderedSlideId !== slide.id) {
      renderedSlideId = slide.id;
      const swap = () => {
        stopRace();
        clearTimeout(cloudTimer);
        if (typeof WordCloud === 'function') WordCloud.stop?.();
        document.body.classList.toggle('with-join', !OWN_QR.has(slide.type));
        stage.innerHTML = '';
        const el = document.createElement('section');
        el.className = 'slide ' + slide.type;
        stage.appendChild(el);
        (builders[slide.type] || builders.unknown)(el, slide);
        (updaters[slide.type] || (() => {}))(el, slide);
      };
      swap();
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
        <div class="qr-card glass" data-panel>
          <div class="qr-box" id="bigQr"></div>
          <div class="qr-url" id="bigUrl"></div>
        </div>`;
    },
    wordcloud(el, sl) {
      el.innerHTML = `<h1>${esc(sl.title)}</h1><p class="sub">${esc(sl.subtitle || '')}</p>
        <div class="cloud-wrap" data-panel><canvas id="cloud"></canvas><div class="empty" id="cloudEmpty">Đang chờ từ khoá đầu tiên… ✨</div><div class="meta" id="cloudMeta"></div></div>`;
      lastCloudKey = '';
    },
    poll(el, sl) {
      el.innerHTML = `<h1>${esc(sl.title)}</h1><p class="sub">${esc(sl.subtitle || '')}</p><div class="poll-status" id="pollStatus"></div>
        <div class="poll-top3 hidden" id="pollTop3"></div>
        <div class="poll-box glass" id="poll" data-panel>${sl.options.map((o, i) => `
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
      if (!sl.speaker) {
        // Section slide ("Mục: Food of Thought"): no speaker card, just the heading and agenda.
        el.classList.add('section');
        el.innerHTML = `<div class="sec-head"><div class="kicker">${esc(sl.kicker || 'Mục')}</div><h1>${esc(sl.title)}</h1>${sl.topic ? `<p class="sub">${esc(sl.topic)}</p>` : ''}
          <div class="ask glass">💬 Gửi câu hỏi ngay trên điện thoại</div></div>
          ${sl.agenda?.length ? `<div class="agenda glass" data-panel>${sl.agenda.map((a, i) => `
            <div class="ag"><div class="ag-n">${i + 1}</div><div><div class="ag-t">${esc(a.title)}</div>
              <ul>${(a.items || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`).join('')}</div>` : ''}`;
        return;
      }
      if (!sl.agenda?.length) { el.innerHTML = intro; return; }
      el.classList.add('with-agenda');
      el.innerHTML = `<div class="sp-intro">${intro}</div>
        <div class="agenda glass" data-panel>${sl.agenda.map((a, i) => `
          <div class="ag"><div class="ag-n">${i + 1}</div><div><div class="ag-t">${esc(a.title)}</div>
            <ul>${(a.items || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`).join('')}</div>`;
    },
    qa(el, sl) {
      el.innerHTML = `<h1>${esc(sl.title)}</h1><p class="sub">${esc(sl.subtitle || '')}</p>
        <div class="qa-grid"><div class="feature glass" id="qaFeature" data-panel></div><div class="list" id="qaList"></div></div>`;
    },
    race(el, sl) {
      el.innerHTML = `<div class="row" style="justify-content:space-between;align-items:flex-end"><div><h1>🦆 ${esc(sl.title)}</h1><p class="sub">${esc(sl.subtitle || '')}</p></div></div>
        <div class="race-stage" data-panel><canvas id="river"></canvas>
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
        <div class="qr-card glass" data-panel style="flex:.8;display:flex;flex-direction:column;align-items:center;padding:28px">
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
  const shownQs = new Set();
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
      // Voting closed + results public → the three leading topics, big.
      const top3 = !open && !hidden && total > 0 && S.poll.view !== 'all';
      el.classList.toggle('show-top3', top3);
      if (top3) {
        const ranked = shownCounts.map((c, i) => ({ c, i })).sort((a, b) => b.c - a.c || a.i - b.i).slice(0, 3);
        const html = ranked.map((r, k) => `
          <div class="t3 t3-${k + 1} glass">
            <div class="t3-medal">${['🥇', '🥈', '🥉'][k]}</div>
            <div class="t3-body"><div class="t3-title">${esc(S.slide.options[r.i])}</div>
              <div class="t3-bar"><i style="width:${Math.round((r.c / Math.max(1, ranked[0].c)) * 100)}%"></i></div></div>
            <div class="t3-val">${r.c}<small>${Math.round((r.c / total) * 100)}% · ${r.c} phiếu</small></div>
          </div>`).join('');
        const box = $('#pollTop3', el);
        if (box._html !== html) { box.innerHTML = `<div class="t3-head">🏆 Top 3 chủ đề được yêu thích nhất</div>${html}`; box._html = html; }
      }
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
      const feat = qs.find((q) => q.highlighted); // only the question the MC picked to answer
      const featBox = $('#qaFeature', el);
      const featHtml = feat
        ? `<div class="kicker">🎤 MC đang trả lời${feat.target ? ' · ' + esc(feat.target) : ''}</div><div class="q">“${esc(feat.text)}”</div><div class="who">— ${feat.name === 'Ẩn danh' ? 'Câu hỏi ẩn danh' : esc(feat.name)} · ▲ ${feat.upvotes}</div>`
        : (qs.length
          ? `<div class="kicker">🎤 Câu hỏi MC chọn trả lời</div><div class="q" style="opacity:.7">MC sẽ chọn câu hỏi tiếp theo…</div>`
          : `<div class="q" style="opacity:.7">Chưa có câu hỏi nào được duyệt.<br>Hãy gửi câu hỏi từ điện thoại nhé! 📱</div>`);
      if (featBox._html !== featHtml) { featBox.innerHTML = featHtml; featBox._html = featHtml; fitText(featBox); }
      const rest = qs.filter((q) => q !== feat).slice(0, 7);
      // Only questions that just appeared get the pop-in; upvote updates must not replay it.
      const html = rest.map((q) => `
        <div class="item glass ${q.status} ${shownQs.has(q.id) ? '' : 'new'}"><div><div class="t">${esc(q.text)}</div><div class="by">${esc(q.name)}${q.target ? ' → ' + esc(q.target) : ''}${q.status === 'answered' ? ' · ✅ đã trả lời' : ''}</div></div><div class="votes">▲ ${q.upvotes}</div></div>`).join('');
      const list = $('#qaList', el);
      if (list._html !== html) { list.innerHTML = html; list._html = html; }
      rest.forEach((q) => shownQs.add(q.id));
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

  // Shrink the featured question until the whole panel fits (long questions must never overflow).
  function fitText(box) {
    const q = box.querySelector('.q');
    if (!q) return;
    const max = Math.min(58, Math.max(30, innerWidth * 0.03)), min = 16;
    let size = max;
    q.style.fontSize = size + 'px';
    while (size > min && box.scrollHeight > box.clientHeight + 1) {
      size -= 2;
      q.style.fontSize = size + 'px';
    }
  }
  addEventListener('resize', () => { const b = document.getElementById('qaFeature'); if (b) fitText(b); });

  function drawCloud(words) {
    const canvas = $('#cloud');
    if (!canvas || !words.length || typeof WordCloud !== 'function') return;
    const r = canvas.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    const max = words[0].count;
    const area = canvas.width * canvas.height;
    const light = document.body.classList.contains('light');
    const palette = light ? ['#d82d8b', '#1c64c8', '#6b0a47', '#c2255c', '#862e9c', '#0b7285', '#e8590c'] : ['#ffd6ec', '#ff6fb5', '#ffa8d5', '#ffe066', '#fcc2d7', '#e599f7'];
    const topColor = light ? '#8a0052' : '#ffffff';
    // Font sizes in px, scaled so all words together cover ~45% of the canvas
    // (a word is roughly 0.6·len·size wide and 1·size tall). shrinkToFit handles the rest.
    const rel = (c) => 0.45 + 0.55 * (c / max);
    const ink = words.reduce((sum, w) => sum + 0.6 * Math.max(2, w.text.length) * rel(w.count) ** 2, 0);
    const k = Math.min(canvas.height * 0.28, Math.sqrt((0.45 * area) / ink));
    const style = new Map(words.map((w, i) => [w.text, {
      color: i === 0 ? topColor : palette[i % palette.length],
      weight: w.count >= max * 0.6 ? 900 : 700,
    }]));
    WordCloud.stop?.();
    WordCloud(canvas, {
      list: words.map((w) => [w.text, Math.max(14 * dpr, k * rel(w.count))]),
      weightFactor: 1, minSize: 6 * dpr,
      fontFamily: '"Be Vietnam Pro", "Segoe UI", sans-serif',
      fontWeight: (w) => style.get(w)?.weight || 700,
      color: (w) => style.get(w)?.color || palette[0],
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
  function stopRace() { if (scene) scene.stop(); scene = null; clearInterval(hudTimer); }

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
          <div class="lobby-qr qr-box">${join.svg}</div>
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
      // Results card: names first and large; the duck is just a small colour badge.
      const top = r.finishOrder.slice(0, 3);
      const team = (p) => (p.team ? `<span class="rr-team">${esc(p.team)}</span>` : '');
      ov.innerHTML = `<div class="race-result">
          <div class="rr-head">🏆 Kết quả Đua vịt</div>
          ${top.map((p, i) => `
            <div class="rr-row rr-${i + 1}">
              <span class="rr-medal">${['🥇', '🥈', '🥉'][i]}</span>
              <canvas class="rr-duck" width="120" height="90" data-color="${p.color}" data-no="${p.no || ''}"></canvas>
              <span class="rr-name">${esc(p.name)}${team(p)}</span>
              <span class="rr-no">Vịt #${p.no || '–'}</span>
            </div>`).join('')}
        </div>`;
      ov.querySelectorAll('.rr-duck').forEach((cv, i) => {
        const ctx = cv.getContext('2d');
        let t = i;
        (function f() {
          if (!cv.isConnected) return;
          ctx.clearRect(0, 0, 120, 90);
          drawDuck(ctx, 56, 58, 30, cv.dataset.color, { bob: t += 0.1, no: Number(cv.dataset.no) });
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

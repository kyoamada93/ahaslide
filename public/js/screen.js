(() => {
  const { socket, $, esc, particles, drawDuck } = TH;
  const stage = $('#stage');
  const params = new URLSearchParams(location.search);
  const adminKey = params.get('key');
  let S = null; // latest public state
  let renderedSlideId = null;
  let join = { url: '', svg: '' };

  particles($('#fx'), 50);
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

  socket.on('state', (s) => { if (s.race) s.race.localEnd = Date.now() + s.race.countdownLeft; S = s; update(); });
  socket.on('reset', () => location.reload());

  function update() {
    const slide = S.slide;
    $('#checkedCount').textContent = S.checkedIn;
    $('#miniJoin').classList.toggle('hidden', slide.type === 'checkin' || slide.type === 'feedback');
    $('#dots').innerHTML = S.slides.map((_, i) => `<span class="${i === S.slideIndex ? 'on' : i < S.slideIndex ? 'done' : ''}"></span>`).join('');
    if (renderedSlideId !== slide.id) {
      renderedSlideId = slide.id;
      stopRace();
      stage.innerHTML = '';
      const el = document.createElement('section');
      el.className = 'slide ' + slide.type;
      stage.appendChild(el);
      (builders[slide.type] || builders.unknown)(el, slide);
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
      el.innerHTML = `<div class="row" style="justify-content:space-between;align-items:flex-end"><div><h1>${esc(sl.title)}</h1><p class="sub">${esc(sl.subtitle || '')}</p></div><div class="poll-status" id="pollStatus"></div></div>
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
      const { counts, total, open } = S.poll;
      const max = Math.max(...counts, 1);
      $('#pollStatus', el).innerHTML = `${open ? '🟢 Đang mở vote' : '🔒 Đã đóng vote'} · <b>${total}</b> phiếu`;
      el.querySelectorAll('.opt').forEach((row, i) => {
        const c = counts[i];
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
        ? `<div class="kicker">${feat.highlighted ? '🎤 Đang trả lời' : '🔥 Top câu hỏi'}${feat.target ? ' · ' + esc(feat.target) : ''}</div><div class="q">“${esc(feat.text)}”</div><div class="who">— ${esc(feat.name)} · ▲ ${feat.upvotes}</div>`
        : `<div class="q" style="opacity:.7">Chưa có câu hỏi nào được duyệt.<br>Hãy gửi câu hỏi từ điện thoại nhé! 📱</div>`;
      const rest = qs.filter((q) => q !== feat).slice(0, 7);
      $('#qaList', el).innerHTML = rest.map((q) => `
        <div class="item glass ${q.status}"><div><div class="t">${esc(q.text)}</div><div class="by">${esc(q.name)}${q.target ? ' → ' + esc(q.target) : ''}${q.status === 'answered' ? ' · ✅ đã trả lời' : ''}</div></div><div class="votes">▲ ${q.upvotes}</div></div>`).join('');
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

  function drawCloud(words) {
    const canvas = $('#cloud');
    if (!canvas || !words.length || typeof WordCloud !== 'function') return;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    const max = words[0].count;
    const area = canvas.width * canvas.height;
    const base = Math.sqrt(area / Math.max(12, words.length * 2.2));
    const palette = ['#ffffff', '#ffd6ec', '#ff6fb5', '#ffa8d5', '#ffe066', '#fcc2d7', '#e599f7'];
    WordCloud(canvas, {
      list: words.map((w) => [w.text, w.count]),
      weightFactor: (c) => Math.max(14 * dpr, Math.min(base * 1.1, base * (0.35 + 0.75 * (c / max)))),
      fontFamily: '"Be Vietnam Pro", "Segoe UI", sans-serif',
      fontWeight: (w, c) => (c >= max * 0.6 ? 900 : 700),
      color: (w, c) => (c === max ? '#ffffff' : palette[(w.length + c) % palette.length]),
      backgroundColor: 'rgba(0,0,0,0)',
      rotateRatio: 0.15, rotationSteps: 2, gridSize: Math.round(8 * dpr), shrinkToFit: true, drawOutOfBound: false,
      shape: 'ellipse', ellipticity: 0.55,
    });
  }

  // ------------------------------------------------------------ race view
  let raceAnim = null;
  let frame = { phase: 'lobby', ducks: [], t: 0 };
  const shown = new Map(); // id -> displayed progress (smoothed)
  let lastRace = null;
  let confettiDone = false;
  socket.on('race:frame', (f) => { frame = f; });

  function startRace() {
    shown.clear(); confettiDone = false;
    const canvas = $('#river');
    const ctx = canvas.getContext('2d');
    let tick = 0;
    function loop() {
      raceAnim = requestAnimationFrame(loop);
      tick += 1;
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = r.width * dpr; canvas.height = r.height * dpr; }
      const W = canvas.width, H = canvas.height;
      // river
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(40,120,200,.55)'); g.addColorStop(1, 'rgba(20,70,150,.7)');
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2 * dpr;
      for (let i = 0; i < 14; i++) { // moving wave dashes
        const y = (i + .5) * H / 14; ctx.setLineDash([30 * dpr, 50 * dpr]); ctx.lineDashOffset = -tick * 2 * dpr - i * 17;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.setLineDash([]);
      const startX = 90 * dpr, finishX = W - 120 * dpr;
      // start & finish
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(startX - 4 * dpr, 0, 4 * dpr, H);
      const sq = 16 * dpr;
      for (let y = 0; y < H; y += sq) for (let c = 0; c < 2; c++) { ctx.fillStyle = ((y / sq + c) % 2) ? '#fff' : '#111'; ctx.fillRect(finishX + c * sq, y, sq, sq); }

      const ducks = frame.ducks;
      const n = ducks.length;
      if (!n) return;
      const lanes = Math.min(n, n > 24 ? 16 : 12);
      const laneH = H / lanes;
      const size = Math.min(laneH * 0.32, 34 * dpr) * (n > 24 ? 0.8 : 1);
      const order = [...ducks].sort((a, b) => b[3] - a[3]);
      const top = new Set(order.slice(0, 8).map((d) => d[0]));
      ducks.forEach((d, i) => {
        const [id, name, color, progress] = d;
        const cur = shown.has(id) ? shown.get(id) : progress;
        const next = cur + (progress - cur) * 0.18;
        shown.set(id, next);
        const lane = i % lanes;
        const sub = Math.floor(i / lanes);
        const y = laneH * (lane + 0.55) + ((sub % 3) - 1) * size * 0.5;
        const x = startX + (finishX - startX - size) * (next / 100);
        drawDuck(ctx, x, y, size, color, tick * 0.15 + i, frame.phase === 'racing' ? Math.sin(tick * 0.6 + i) : 0);
        if (n <= 24 || top.has(id)) {
          ctx.font = `700 ${Math.round(Math.max(12 * dpr, size * 0.5))}px "Be Vietnam Pro", sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4 * dpr; ctx.strokeStyle = 'rgba(0,0,0,.55)';
          ctx.strokeText(name, x, y - size * 1.1);
          ctx.fillStyle = '#fff'; ctx.fillText(name, x, y - size * 1.1);
        }
      });
      // leaderboard + timer while racing
      const board = $('#raceBoard');
      if (board && frame.phase === 'racing' && tick % 6 === 0) {
        board.classList.remove('hidden');
        board.innerHTML = '<h3>Dẫn đầu</h3>' + order.slice(0, 5).map((d, i) => `<div class="r">${['🥇', '🥈', '🥉', '4.', '5.'][i]} <i style="background:${d[2]}"></i><span>${esc(d[1])}</span></div>`).join('');
        const t = $('#raceTimer');
        t.classList.remove('hidden');
        t.textContent = '⏱ ' + Math.max(0, frame.t / 1000).toFixed(1) + 's';
      }
    }
    loop();
  }
  function stopRace() { if (raceAnim) cancelAnimationFrame(raceAnim); raceAnim = null; }

  let cdTimer = null;
  function raceState(r) {
    const ov = $('#raceOverlay');
    if (!ov) return;
    const sig = r.phase + r.playerCount + r.finishOrder.length;
    if (lastRace === sig && r.phase !== 'lobby') return;
    lastRace = sig;
    clearInterval(cdTimer);
    ov.classList.toggle('dim', r.phase === 'finished' || r.phase === 'lobby');
    if (r.phase !== 'racing') { $('#raceBoard').classList.add('hidden'); $('#raceTimer').classList.add('hidden'); }
    if (r.phase === 'lobby') {
      confettiDone = false; shown.clear();
      const ducks = frame.ducks || [];
      ov.innerHTML = `<div style="font-size:54px;font-weight:900;text-shadow:0 6px 30px rgba(0,0,0,.4)">${r.playerCount} chú vịt đã xuống nước</div>
        <div style="font-size:26px;margin-top:10px">📱 Mở điện thoại → bấm <b>“Tham gia đua”</b></div>
        <div class="lobby-ducks">${ducks.slice(-40).map((d) => `<span style="background:${d[2]}">${esc(d[1])}</span>`).join('')}</div>`;
    } else if (r.phase === 'countdown') {
      const draw = () => {
        const left = Math.ceil((r.localEnd - Date.now()) / 1000);
        ov.innerHTML = `<div class="countdown" key="${left}">${left > 0 ? left : 'GO!'}</div>`;
      };
      draw(); cdTimer = setInterval(draw, 250);
    } else if (r.phase === 'racing') {
      ov.innerHTML = '';
    } else if (r.phase === 'finished') {
      const [a, b, c] = r.finishOrder;
      const block = (p, k) => p ? `<div class="p p${k}"><div class="name">${esc(p.name)}</div><div class="block">${k}</div></div>` : '';
      ov.innerHTML = `<div style="font-size:60px;font-weight:900;text-shadow:0 6px 30px rgba(0,0,0,.5)">🏆 Chúc mừng!</div>
        <div class="podium">${block(b, 2)}${block(a, 1)}${block(c, 3)}</div>`;
      if (!confettiDone) { confettiDone = true; confetti(); }
    }
  }
  setInterval(() => { if (S && S.slide.type === 'race') { lastRace = null; raceState(S.race); } }, 1500);

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

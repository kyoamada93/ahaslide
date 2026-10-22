(() => {
  const { socket, $, esc, toast, emit, drawDuck } = TH;
  const app = $('#app');
  const LS_KEY = 'th_uid';
  let S = null; // public state
  let ME = null; // my state
  let uid = null;
  try { uid = localStorage.getItem(LS_KEY); } catch {}
  let lastSig = '';
  const fb = { overall: 0, content: 0, organization: 0 };

  socket.on('connect', () => {
    if (uid) socket.emit('hello', uid, (res) => { if (!res?.ok) { uid = null; ME = { user: null }; render(true); } });
    else { ME = { user: null }; render(true); }
  });
  socket.on('state', (s) => { if (s.race) s.race.localEnd = Date.now() + s.race.countdownLeft; S = s; render(); });
  socket.on('me', (m) => { ME = m; render(); });
  socket.on('reset', () => { try { localStorage.removeItem(LS_KEY); } catch {} location.reload(); });

  // ---------------------------------------------------------------- render
  function signature() {
    const sl = S.slide;
    const base = [sl.id, !!ME?.user, ME?.user?.name];
    switch (sl.type) {
      case 'wordcloud': return JSON.stringify([base, ME?.words?.[sl.id]]);
      case 'poll': return JSON.stringify([base, ME?.votes?.[sl.id], S.poll]);
      case 'speaker': return JSON.stringify([base, ME?.questions]);
      case 'qa': return JSON.stringify([base, S.questions, ME?.upvoted, ME?.questions]);
      case 'race': return JSON.stringify([base, S.race.phase, S.race.finishOrder, ME?.duck]);
      case 'feedback': return JSON.stringify([base, ME?.feedbackDone]);
      default: return JSON.stringify(base);
    }
  }

  function render(force) {
    if (!S || !ME) return;
    const chip = $('#meChip');
    chip.classList.toggle('hidden', !ME.user);
    if (ME.user) chip.textContent = '👋 ' + ME.user.name;
    const sig = signature();
    if (!force && sig === lastSig) return raceOverlay();
    lastSig = sig;

    // Keep whatever the user is typing across re-renders.
    const saved = {};
    app.querySelectorAll('input[id], textarea[id], select[id]').forEach((el) => { saved[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
    const focused = document.activeElement?.id;
    const sel = focused && 'selectionStart' in document.activeElement ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;

    app.innerHTML = ME.user ? (views[S.slide.type] || views.waiting)(S.slide) : views.checkinForm();

    for (const [id, v] of Object.entries(saved)) { const el = document.getElementById(id); if (el) el.type === 'checkbox' ? (el.checked = v) : (el.value = v); }
    const f = focused && document.getElementById(focused);
    if (f) { f.focus(); if (sel && f.setSelectionRange) try { f.setSelectionRange(sel[0], sel[1]); } catch {} }
    bind();
    raceOverlay();
  }

  const askBox = (target) => `
    <div class="card glass">
      <div class="kick">Q&A</div>
      <h2>Đặt câu hỏi${target ? ' cho ' + esc(target) : ''}</h2>
      <textarea id="qText" maxlength="300" placeholder="Câu hỏi của bạn…"></textarea>
      ${target ? `<input type="hidden" id="qTarget" value="${esc(target)}">` : `<label for="qTarget">Gửi tới</label><select id="qTarget">${S.qaTargets.map((t) => `<option>${esc(t)}</option>`).join('')}</select>`}
      <label class="check"><input type="checkbox" id="qAnon"> Gửi ẩn danh</label>
      <button class="btn block" data-act="ask">Gửi câu hỏi</button>
      <p class="muted" style="font-size:13px;margin-top:10px">Câu hỏi sẽ hiển thị sau khi moderator duyệt.</p>
    </div>`;

  const myQuestions = () => (ME.questions?.length ? `
    <div class="card glass"><div class="kick">Câu hỏi của bạn</div>
      ${ME.questions.slice().reverse().map((q) => `<div class="qitem"><div class="t">${esc(q.text)}</div><span class="pill ${q.status}">${{ pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Không hiển thị', answered: 'Đã trả lời' }[q.status]}</span></div>`).join('')}
    </div>` : '');

  const views = {
    checkinForm: () => `
      <div class="card glass">
        <div class="kick">${esc(S.eventSubtitle)}</div>
        <h2>Check-in ${esc(S.eventTitle)}</h2>
        <p class="muted">Nhập tên để tham gia các hoạt động tương tác nhé!</p>
        <label for="ciName">Tên của bạn *</label>
        <input type="text" id="ciName" maxlength="40" autocomplete="name" placeholder="VD: Nguyễn Văn A">
        <label for="ciTeam">Team / Phòng ban</label>
        <input type="text" id="ciTeam" maxlength="40" placeholder="VD: Data Platform">
        <button class="btn block" data-act="checkin">Check-in 🚀</button>
      </div>`,

    waiting: () => `<div class="card glass center"><div class="big-emoji">⏳</div><h2>Chờ chút nhé<span class="wait-dots"></span></h2><p class="muted">Nội dung sẽ hiện khi presenter chuyển slide.</p></div>`,

    checkin: () => `
      <div class="card glass center">
        <div class="big-emoji">✅</div>
        <h2>Check-in thành công!</h2>
        <p>Xin chào <b>${esc(ME.user.name)}</b>${ME.user.team ? ' · ' + esc(ME.user.team) : ''}</p>
        <p class="muted">Hãy giữ trang này mở — màn hình sẽ tự chuyển theo chương trình<span class="wait-dots"></span></p>
      </div>`,

    wordcloud: (sl) => {
      const mine = ME.words?.[sl.id] || [];
      const max = sl.maxPerUser || 3;
      return `
      <div class="card glass">
        <div class="kick">Word cloud</div>
        <h2>${esc(sl.title)}</h2>
        <p class="muted">${esc(sl.subtitle || '')}</p>
        ${mine.length < max ? `<div class="input-row"><input type="text" id="wInput" maxlength="30" placeholder="Từ khoá…" enterkeyhint="send"><button class="btn" data-act="word">Gửi</button></div>
        <p class="muted" style="font-size:13px;margin-top:8px">Còn ${max - mine.length}/${max} lượt</p>` : `<p style="margin-top:12px">🎉 Bạn đã gửi đủ ${max} từ khoá. Xem màn hình lớn nhé!</p>`}
        ${mine.length ? `<div class="chips">${mine.map((w) => `<span>${esc(w)}</span>`).join('')}</div>` : ''}
      </div>`;
    },

    poll: (sl) => {
      const my = ME.votes?.[sl.id];
      const p = S.poll;
      const voted = my !== null && my !== undefined;
      return `
      <div class="card glass">
        <div class="kick">Vote · ${p.total} phiếu ${p.open ? '' : '· 🔒 Đã đóng'}</div>
        <h2>${esc(sl.title)}</h2>
        <p class="muted">${esc(sl.subtitle || '')}</p>
        <div class="opts">${sl.options.map((o, i) => {
          const pc = p.total ? Math.round((p.counts[i] / p.total) * 100) : 0;
          return `<button class="opt ${my === i ? 'sel' : ''}" data-act="vote" data-i="${i}" ${p.open ? '' : 'disabled'}>
            ${voted ? `<span class="fill" style="width:${pc}%"></span>` : ''}
            <span class="n">${i + 1}</span><span class="tx">${esc(o)}</span>${voted ? `<span class="pc">${pc}% · ${p.counts[i]} phiếu</span>` : ''}</button>`;
        }).join('')}</div>
        ${voted ? '<p class="muted" style="margin-top:12px;font-size:14px">✅ Đã ghi nhận. Bạn có thể đổi lựa chọn khi vote còn mở.</p>' : ''}
      </div>`;
    },

    speaker: (sl) => `
      <div class="card glass center">
        <div class="kick">${esc(sl.title || 'Sharing')}</div>
        <h2>🎤 ${esc(sl.speaker)}</h2>
        <p>${esc(sl.topic || '')}</p>
        ${(sl.agenda || []).map((a, i) => `<div style="text-align:left;margin-top:12px"><b>${i + 1}. ${esc(a.title)}</b><div class="muted" style="font-size:14px">${(a.items || []).map(esc).join(' · ')}</div></div>`).join('')}
      </div>
      ${askBox(sl.speaker)}
      ${myQuestions()}`,

    qa: (sl) => {
      const up = new Set(ME.upvoted || []);
      const list = S.questions;
      return `
      ${askBox(null)}
      <div class="card glass">
        <div class="kick">Câu hỏi đã duyệt · ${list.length}</div>
        <h2>Upvote câu hỏi bạn quan tâm</h2>
        ${list.length ? list.map((q) => `
          <div class="qitem"><div><div class="t">${q.highlighted ? '🎤 ' : ''}${esc(q.text)}</div><div class="by">${esc(q.name)}${q.target ? ' → ' + esc(q.target) : ''}${q.status === 'answered' ? ' · ✅ đã trả lời' : ''}</div></div>
            <button class="up ${up.has(q.id) ? 'on' : ''}" data-act="upvote" data-id="${q.id}" ${q.status === 'answered' ? 'disabled' : ''}>▲ ${q.upvotes}</button></div>`).join('') : '<p class="muted">Chưa có câu hỏi nào được duyệt.</p>'}
      </div>
      ${myQuestions()}`;
    },

    race: () => {
      const r = S.race;
      const duck = ME.duck;
      if (r.phase === 'finished') {
        const top = r.finishOrder.slice(0, 3);
        const mine = r.finishOrder.findIndex((p) => p.id === uid);
        return `<div class="card glass center"><div class="big-emoji">🏁</div><h2>Kết thúc cuộc đua!</h2>
          ${mine >= 0 ? `<p style="font-size:22px">Vịt của bạn về hạng <b>#${mine + 1}</b> / ${r.finishOrder.length}</p>` : ''}
          ${top.map((p, i) => `<p style="font-size:18px">${['🥇', '🥈', '🥉'][i]} <b>${esc(p.name)}</b></p>`).join('')}
          <p class="muted">Chờ presenter cho đua lượt tiếp theo nhé!</p></div>`;
      }
      if (!duck) {
        if (r.phase !== 'lobby') return `<div class="card glass center"><div class="big-emoji">🦆</div><h2>Cuộc đua đang diễn ra!</h2><p class="muted">Xem màn hình lớn và chờ lượt sau nhé.</p></div>`;
        return `<div class="card glass center"><div class="kick">Đua vịt</div><canvas class="duck-pre" id="duckPre" width="320" height="220"></canvas>
          <h2>Đua vịt MoMo</h2><p class="muted">Khi có hiệu lệnh, tap liên tục vào màn hình để vịt của bạn bơi nhanh hơn!</p>
          <button class="btn block" data-act="race-join">Tham gia đua 🦆</button></div>`;
      }
      return `<div class="card glass center"><div class="kick">Bạn đã vào đường đua</div><canvas class="duck-pre" id="duckPre" width="320" height="220"></canvas>
        <h2>Vịt của bạn đã sẵn sàng!</h2><p class="muted">Chờ presenter bấm bắt đầu<span class="wait-dots"></span><br>Chuẩn bị ngón tay nhé 👆</p></div>`;
    },

    feedback: () => {
      if (ME.feedbackDone) return `<div class="card glass center"><div class="big-emoji">💖</div><h2>Cảm ơn góp ý của bạn!</h2><p class="muted">Hẹn gặp lại ở Townhall kỳ sau.</p></div>`;
      const stars = (k) => `<div class="stars-in" data-k="${k}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-act="star" data-k="${k}" data-n="${n}" class="${fb[k] >= n ? 'on' : ''}">★</button>`).join('')}</div>`;
      return `<div class="card glass">
        <div class="kick">Đánh giá chương trình</div>
        <h2>${esc(S.slide.title)}</h2>
        <p class="muted">${esc(S.slide.subtitle || '')}</p>
        <label>Đánh giá tổng thể *</label>${stars('overall')}
        <label>Nội dung sharing</label>${stars('content')}
        <label>Tổ chức & tương tác</label>${stars('organization')}
        <label for="fbLiked">Bạn thích nhất điều gì?</label><textarea id="fbLiked" maxlength="500"></textarea>
        <label for="fbSuggest">Góp ý cho Townhall kỳ sau</label><textarea id="fbSuggest" maxlength="1000"></textarea>
        <label for="fbTopics">Chủ đề muốn nghe kỳ sau</label><input type="text" id="fbTopics" maxlength="500" placeholder="VD: LLM evaluation, MLOps…">
        <label class="check"><input type="checkbox" id="fbAnon"> Gửi ẩn danh</label>
        <button class="btn block" data-act="feedback">Gửi đánh giá</button>
      </div>`;
    },
  };

  // ---------------------------------------------------------------- actions
  function bind() {
    const pre = $('#duckPre');
    if (pre) {
      const ctx = pre.getContext('2d');
      let t = 0;
      const color = ME.duck?.color || '#FFD43B';
      cancelAnimationFrame(pre._raf);
      (function f() { if (!pre.isConnected) return; ctx.clearRect(0, 0, 320, 220); drawDuck(ctx, 150, 120, 60, color, t += 0.08); pre._raf = requestAnimationFrame(f); })();
    }
    const w = $('#wInput');
    if (w) w.addEventListener('keydown', (e) => { if (e.key === 'Enter') act('word'); });
    const n = $('#ciName');
    if (n) n.addEventListener('keydown', (e) => { if (e.key === 'Enter') act('checkin'); });
  }

  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled) act(b.dataset.act, b);
  });

  async function act(type, el) {
    let res;
    switch (type) {
      case 'checkin': {
        const name = $('#ciName').value.trim();
        if (name.length < 2) return toast('Vui lòng nhập tên của bạn');
        res = await emit('checkin', { name, team: $('#ciTeam').value });
        if (res.ok) { uid = res.id; try { localStorage.setItem(LS_KEY, uid); } catch {} toast('Check-in thành công 🎉'); }
        break;
      }
      case 'word': {
        const inp = $('#wInput');
        const word = inp.value.trim();
        if (!word) return;
        res = await emit('word:add', { slideId: S.slide.id, word });
        if (res.ok) { inp.value = ''; toast('Đã gửi ✨'); }
        break;
      }
      case 'vote':
        res = await emit('poll:vote', { slideId: S.slide.id, option: Number(el.dataset.i) });
        if (res.ok) toast('Đã vote ✅');
        break;
      case 'ask': {
        const text = $('#qText').value.trim();
        if (text.length < 3) return toast('Câu hỏi quá ngắn');
        res = await emit('qa:ask', { text, target: $('#qTarget').value, anonymous: $('#qAnon').checked });
        if (res.ok) { $('#qText').value = ''; toast('Đã gửi, chờ moderator duyệt nhé 🙌'); }
        break;
      }
      case 'upvote':
        res = await emit('qa:upvote', el.dataset.id);
        break;
      case 'race-join':
        res = await emit('race:join');
        break;
      case 'star':
        fb[el.dataset.k] = Number(el.dataset.n);
        el.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', Number(x.dataset.n) <= fb[el.dataset.k]));
        return;
      case 'feedback':
        if (!fb.overall) return toast('Vui lòng chấm điểm tổng thể ⭐');
        res = await emit('feedback:submit', { ...fb, liked: $('#fbLiked').value, suggestion: $('#fbSuggest').value, nextTopics: $('#fbTopics').value, anonymous: $('#fbAnon').checked });
        if (res.ok) toast('Cảm ơn bạn 💖');
        break;
    }
    if (res && !res.ok && res.error) toast(res.error);
  }

  // ---------------------------------------------------------------- race tap zone
  let zone = null;
  let pendingTaps = 0;
  let myRace = { progress: 0, position: 0, total: 0, rank: 0 };
  let zoneRaf = null;
  let cdInt = null;
  socket.on('race:me', (m) => { myRace = m; if (zone) updateZone(); });
  setInterval(() => { if (pendingTaps > 0) { socket.emit('race:tap', pendingTaps); pendingTaps = 0; } }, 100);

  function raceOverlay() {
    const active = S?.slide.type === 'race' && ME?.duck && (S.race.phase === 'countdown' || S.race.phase === 'racing');
    if (!active) { if (zone) { zone.remove(); zone = null; cancelAnimationFrame(zoneRaf); clearInterval(cdInt); } return; }
    if (!zone) {
      zone = document.createElement('div');
      zone.className = 'tap-zone';
      zone.innerHTML = `<div class="count hidden" id="zCount"></div><canvas id="zDuck" width="600" height="400"></canvas>
        <div class="tap-hint" id="zHint">TAP! TAP! TAP!</div><div class="prog"><i id="zProg"></i></div><div class="rank" id="zRank"></div>`;
      document.body.appendChild(zone);
      zone.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (S.race.phase !== 'racing') return;
        pendingTaps += 1;
        zone.classList.add('bump'); setTimeout(() => zone && zone.classList.remove('bump'), 60);
        if (navigator.vibrate) navigator.vibrate(8);
      });
      zone.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
      zone.addEventListener('contextmenu', (e) => e.preventDefault());
      const ctx = zone.querySelector('#zDuck').getContext('2d');
      let t = 0;
      (function f() {
        ctx.clearRect(0, 0, 600, 400);
        const racing = S.race.phase === 'racing';
        drawDuck(ctx, 280, 220, 120, ME.duck?.color || '#FFD43B', t += racing ? 0.3 : 0.08, racing ? Math.sin(t * 2) : 0);
        zoneRaf = requestAnimationFrame(f);
      })();
      clearInterval(cdInt);
      cdInt = setInterval(updateZone, 200);
    }
    updateZone();
  }

  function updateZone() {
    if (!zone) return;
    const r = S.race;
    const cnt = zone.querySelector('#zCount');
    if (r.phase === 'countdown') {
      const left = Math.ceil((r.localEnd - Date.now()) / 1000);
      cnt.classList.remove('hidden');
      cnt.textContent = left > 0 ? left : 'GO!';
      zone.querySelector('#zHint').textContent = 'Chuẩn bị…';
      zone.querySelector('#zDuck').classList.add('hidden');
    } else {
      cnt.classList.add('hidden');
      zone.querySelector('#zDuck').classList.remove('hidden');
      zone.querySelector('#zHint').textContent = myRace.rank ? `🏁 Về đích hạng #${myRace.rank}!` : 'TAP! TAP! TAP!';
    }
    zone.querySelector('#zProg').style.width = (myRace.progress || 0) + '%';
    zone.querySelector('#zRank').textContent = myRace.total ? `Vị trí ${myRace.position}/${myRace.total}` : '';
  }
})();

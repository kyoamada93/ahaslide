/* MC page: pick which approved question goes on the big screen, mark answered, move to the next.
   Also: timers (now / programme / slide / current answer), the MC script for the current slide
   and question groups (😄 fun · 🎯 OKR & direction · 🔥 pay & resource). */
(() => {
  const { socket, $, esc, toast, emit } = TH;
  const SCRIPT = window.MC_SCRIPT || { slides: {}, leadIns: {}, notes: {}, answerTime: { warnMin: 3, maxMin: 5 } };
  const CATS = { fun: '😄 Vui vẻ', okr: '🎯 OKR & định hướng', hard: '🔥 Lương & resource' };
  const SLIDE_LABEL = { checkin: 'Check-in', wordcloud: 'Word cloud', poll: 'Vote', speaker: 'Sharing', qa: 'Q&A', race: 'Đua vịt', feedback: 'Kết thúc' };
  const params = new URLSearchParams(location.search);
  let key = params.get('key');
  try { key = key || sessionStorage.getItem('th_mc_key'); } catch {}
  let S = null;
  let skew = 0; // server clock − this device's clock
  let tab = 'top';
  let cat = 'all';
  let scriptPick = null; // slide type the MC chose to read; null = follow the screen
  let lastSlideId = null;

  async function login(k) {
    const res = await emit('admin:auth', k);
    if (!res.ok) { $('#login').classList.remove('hidden'); $('#panel').classList.add('hidden'); if (k) toast('Sai mã'); return; }
    key = k;
    try { sessionStorage.setItem('th_mc_key', k); } catch {}
    $('#login').classList.add('hidden');
    $('#panel').classList.remove('hidden');
  }
  socket.on('connect', () => (key ? login(key) : $('#login').classList.remove('hidden')));
  $('#loginBtn').onclick = () => login($('#keyInput').value.trim());
  $('#keyInput').addEventListener('keydown', (e) => e.key === 'Enter' && $('#loginBtn').click());

  socket.on('state', (s) => { if (!s.slides) return; S = s; skew = s.now ? s.now - Date.now() : 0; render(); tick(); });

  async function action(a) {
    const res = await emit('admin:action', a);
    if (!res.ok) toast(res.error === 'unauthorized' ? 'Không có quyền' : res.error || 'Lỗi');
    return res;
  }

  $('#toQa').onclick = () => {
    const i = S.slides.findIndex((x) => x.type === 'qa');
    if (i >= 0) action({ type: 'goto', index: i });
  };
  $('#tmProgramBtn').onclick = () => {
    if (S.programStartedAt && !confirm('Bấm lại đồng hồ chương trình từ 0?')) return;
    action({ type: 'timer:program' });
  };
  document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; render(); }; });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || !S) return;
    const cur = S.questions.find((q) => q.highlighted);
    switch (b.dataset.a) {
      case 'pick': return action({ type: 'qa:highlight', qid: b.dataset.id }).then((r) => r.ok && toast('Đã đưa lên màn hình 🎤'));
      case 'answered': if (cur) action({ type: 'qa:status', qid: cur.id, status: 'answered' }); return;
      case 'clear': if (cur) action({ type: 'qa:highlight', qid: cur.id }); return;
      case 'next': return action({ type: 'qa:next' });
      case 'reopen': return action({ type: 'qa:status', qid: b.dataset.id, status: 'approved' });
      case 'cat': cat = b.dataset.c; return render();
      case 'script': scriptPick = b.dataset.t === S.slide.type ? null : b.dataset.t; return renderScript();
    }
  });
  document.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-cat]');
    if (sel) sel.blur();
    if (sel) action({ type: 'qa:category', qid: sel.dataset.cat, category: sel.value }).then((r) => r.ok && toast('Đã đổi nhóm'));
  });

  // ---------------------------------------------------------------- timers
  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0');
  };
  function tick() {
    if (!S) return;
    const now = Date.now() + skew;
    $('#tmClock').textContent = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    $('#tmProgram').textContent = S.programStartedAt ? fmt(now - S.programStartedAt) : '—';
    $('#tmProgramBtn').textContent = S.programStartedAt ? '↺' : '▶ Bắt đầu';
    $('#tmProgramBtn').title = S.programStartedAt ? 'Bấm lại từ 0' : 'Bắt đầu tính giờ chương trình';
    $('#tmSlide').textContent = S.slideStartedAt ? fmt(now - S.slideStartedAt) : '—';
    const cur = S.questions.find((q) => q.highlighted);
    const ms = cur?.highlightedAt ? now - cur.highlightedAt : 0;
    $('#tmQ').textContent = cur?.highlightedAt ? fmt(ms) : '—';
    const box = $('#tmQBox');
    box.classList.toggle('warn', ms >= SCRIPT.answerTime.warnMin * 60000 && ms < SCRIPT.answerTime.maxMin * 60000);
    box.classList.toggle('over', ms >= SCRIPT.answerTime.maxMin * 60000);
  }
  setInterval(tick, 1000);
  if (innerWidth < 700) $('#scriptBox').open = false; // phones: question first, script on tap

  // ---------------------------------------------------------------- script
  const counts = () => {
    const c = { fun: 0, okr: 0, hard: 0 };
    S.questions.forEach((q) => { if (q.status === 'approved' && c[q.category] !== undefined) c[q.category]++; });
    return c;
  };
  const fill = (t) => {
    const c = counts();
    return esc(t).replace(/\{event\}/g, esc(S.eventTitle || 'Townhall')).replace(/\{checkins\}/g, S.checkedIn)
      .replace(/\{fun\}/g, c.fun).replace(/\{okr\}/g, c.okr).replace(/\{hard\}/g, c.hard)
      .replace(/\[([^\]]+)\]/g, '<i class="muted">[$1]</i>');
  };
  let scriptHtml = '';
  function renderScript() {
    const type = scriptPick || S.slide.type;
    const blocks = SCRIPT.slides[type] || [];
    const html = (blocks.length ? blocks.map((b) => `<div class="cue">${esc(b.cue)}</div>${b.lines.map((l) => `<p class="line">${fill(l)}</p>`).join('')}`).join('')
      : '<p class="muted">Chưa có kịch bản cho slide này.</p>');
    const types = [...new Set(S.slides.map((x) => x.type))].filter((t) => SCRIPT.slides[t]);
    const tabs = 'Xem kịch bản slide khác: ' + types.map((t) => `<button data-a="script" data-t="${t}" class="${t === type ? 'on' : ''}">${SLIDE_LABEL[t] || t}${t === S.slide.type ? ' 📺' : ''}</button>`).join('');
    $('#scriptFor').textContent = scriptPick ? `${SLIDE_LABEL[type] || type} (đang xem trước)` : `${SLIDE_LABEL[type] || type} — theo màn hình`;
    if (html + tabs !== scriptHtml) { $('#scriptBody').innerHTML = html; $('#scriptTabs').innerHTML = tabs; scriptHtml = html + tabs; }
  }

  // Same lead-in for a question every time it is shown.
  const pickLine = (arr, id) => (arr?.length ? arr[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % arr.length] : '');
  const badge = (c) => `<span class="cat cat-${c}">${CATS[c] || c}</span>`;

  let listHtml = '';
  function render() {
    if (!S) return;
    if (S.slide.id !== lastSlideId) { lastSlideId = S.slide.id; scriptPick = null; }
    $('#curTitle').textContent = `${S.slideIndex + 1}. ${S.slide.title}`;
    $('#toQa').classList.toggle('hidden', S.slide.type === 'qa');
    renderScript();

    const cur = S.questions.find((q) => q.highlighted);
    $('#nowCat').innerHTML = cur ? badge(cur.category) : '';
    $('#nowText').innerHTML = cur
      ? `“${esc(cur.text)}”<div class="mc-meta">▲ ${cur.upvotes} upvote${cur.target ? ' · → ' + esc(cur.target) : ''}</div>`
      : '<span class="muted">Chưa chọn câu nào — bấm 🎤 ở danh sách bên dưới.</span>';
    const lead = cur && pickLine(SCRIPT.leadIns[cur.category], cur.id);
    $('#nowLead').classList.toggle('hidden', !lead);
    $('#nowLead').textContent = lead ? '🗣 ' + lead : '';
    const note = cur && SCRIPT.notes[cur.category];
    $('#nowNote').classList.toggle('hidden', !note);
    $('#nowNote').textContent = note ? '💡 ' + note : '';
    $('#btnAnswered').disabled = !cur;
    $('#btnClear').disabled = !cur;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));

    const inTab = S.questions.filter((q) => (tab === 'answered' ? q.status === 'answered' : q.status === 'approved' && !q.highlighted));
    const n = { all: inTab.length, fun: 0, okr: 0, hard: 0 };
    inTab.forEach((q) => { n[q.category] = (n[q.category] || 0) + 1; });
    $('#cats').innerHTML = [['all', 'Tất cả'], ...Object.entries(CATS)].map(([k, l]) => `<button data-a="cat" data-c="${k}" class="${cat === k ? 'on' : ''}">${l} <span class="n">${n[k] || 0}</span></button>`).join('');
    let list = inTab.filter((q) => cat === 'all' || q.category === cat);
    list = tab === 'new' ? list.sort((a, b) => b.createdAt - a.createdAt) : list.sort((a, b) => b.upvotes - a.upvotes || a.createdAt - b.createdAt);
    $('#listTitle').textContent = tab === 'answered' ? `Đã trả lời (${list.length})` : `Câu hỏi đã duyệt, chưa trả lời (${list.length})`;
    const html = list.length ? list.map((q) => `
      <div class="mc-item">
        <div class="mc-votes">▲ ${q.upvotes}</div>
        <div class="mc-q">${esc(q.text)}<div class="mc-meta">${esc(q.name)}${q.target ? ' · → ' + esc(q.target) : ''} · ${new Date(q.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}${q.answerMs ? ` · ⏱ đã trả lời ${fmt(q.answerMs)}` : ''}</div>
          <select class="cat-sel cat-${q.category}" data-cat="${q.id}" title="Nhóm câu hỏi (tự phân loại, bấm để đổi)">${Object.entries(CATS).map(([k, l]) => `<option value="${k}" ${q.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${tab === 'answered'
          ? `<button class="btn small ghost" data-a="reopen" data-id="${q.id}">↩ Mở lại</button>`
          : `<button class="btn" data-a="pick" data-id="${q.id}">🎤 Chọn</button>`}
      </div>`).join('')
      : `<p class="muted">${tab === 'answered' ? 'Chưa có câu nào được trả lời.' : cat !== 'all' ? 'Không có câu nào trong nhóm này.' : 'Chưa có câu hỏi nào được moderator duyệt.'}</p>`;
    // Re-render only on change so an open category dropdown is not closed by a state update.
    if (html !== listHtml && !document.activeElement?.matches('select[data-cat]')) { $('#list').innerHTML = html; listHtml = html; }
  }
})();

(() => {
  const { socket, $, esc, toast, emit } = TH;
  const isMod = document.body.classList.contains('moderator');
  const params = new URLSearchParams(location.search);
  let key = params.get('key');
  try { key = key || sessionStorage.getItem('th_admin_key'); } catch {}
  let S = null, A = null;
  let qaTab = 'pending';
  let qaSortAdmin = 'top';
  let lastControlsSig = '';

  const TYPE_LABEL = { checkin: 'Check-in', wordcloud: 'Word cloud', poll: 'Vote', speaker: 'Sharing', qa: 'Q&A', race: 'Đua vịt', feedback: 'Feedback' };

  async function login(k) {
    const res = await emit('admin:auth', k);
    if (!res.ok) { $('#login').classList.remove('hidden'); $('#panel').classList.add('hidden'); if (k) toast('Sai admin key'); return; }
    key = k;
    try { sessionStorage.setItem('th_admin_key', k); } catch {}
    $('#login').classList.add('hidden');
    $('#panel').classList.remove('hidden');
    if (!isMod) {
      $('#openScreen').href = '/screen?key=' + encodeURIComponent(k);
      $('#openMod').href = '/moderator?key=' + encodeURIComponent(k);
      $('#openMc').href = '/mc?key=' + encodeURIComponent(k);
      $('#preview').src = '/screen';
      $('#exports').innerHTML = ['checkins', 'words', 'votes', 'questions', 'race', 'feedback']
        .map((w) => `<a class="btn small ghost" href="/api/export/${w}?key=${encodeURIComponent(k)}">${w}</a>`).join('');
      renderBrand();
      fitPreview();
    }
  }

  const BRAND_SLOTS = [['ai-data-logo', 'Logo AI & Data'], ['bg', 'Background 16:9 (màn chiếu)'], ['bg-mobile', 'Background 9:16 (điện thoại)']];
  function renderBrand() {
    const v = Date.now();
    $('#brand').innerHTML = BRAND_SLOTS.map(([slot, label]) => `
      <div class="slot"><img src="/brand/${slot}?v=${v}" alt=""><div><b>${label}</b>
        <label class="btn small ghost">Tải lên<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-slot="${slot}"></label>
        <button class="btn small ghost" data-a="brand-reset" data-slot="${slot}">Mặc định</button></div></div>`).join('');
  }
  document.addEventListener('change', async (e) => {
    const inp = e.target.closest('input[type=file][data-slot]');
    if (!inp || !inp.files[0]) return;
    const f = inp.files[0];
    const r = await fetch(`/api/brand/${inp.dataset.slot}?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': f.type }, body: f });
    toast(r.ok ? 'Đã cập nhật ✅' : 'Lỗi: ' + (await r.text()));
    renderBrand();
  });
  socket.on('connect', () => (key ? login(key) : $('#login').classList.remove('hidden')));
  const googleResult = params.get('google');
  if (googleResult) {
    setTimeout(() => toast(googleResult === 'ok' ? '✅ Đã đăng nhập Google — bấm 🔄 Đồng bộ ngay' : `⚠️ Đăng nhập Google không thành công: ${googleResult}`, 5000), 600);
    history.replaceState(null, '', location.pathname);
  }
  $('#loginBtn').onclick = () => login($('#keyInput').value.trim());
  $('#keyInput').addEventListener('keydown', (e) => e.key === 'Enter' && $('#loginBtn').click());

  function fitPreview() {
    const box = $('.preview');
    if (!box) return;
    $('#preview').style.transform = `scale(${box.clientWidth / 1920})`;
  }
  addEventListener('resize', fitPreview);

  socket.on('state', (s) => { if (!s.slides) return; S = s; renderMain(); });
  socket.on('admin', (a) => { A = a; renderMain(); renderQa(); renderSheet(); });

  // Google Sheet import box (admin page only). Inputs are only filled while untouched.
  let sheetDirty = false;
  ['sheetUrl', 'sheetApprove', 'sheetAuto'].forEach((id) => document.getElementById(id)?.addEventListener('input', () => { sheetDirty = true; }));
  function renderSheet() {
    if (!A?.sheet || !document.getElementById('sheetBox')) return;
    if (!sheetDirty) {
      $('#sheetUrl').value = A.sheet.url || '';
      $('#sheetApprove').checked = !!A.sheet.approve;
      $('#sheetAuto').checked = !!A.sheet.auto;
    }
    const g = A.google || {};
    $('#googleRow').innerHTML = g.connected
      ? `<span class="pill ok-pill">✅ Google: ${esc(g.email || 'đã đăng nhập')}</span> <button class="btn small ghost" data-a="google-logout">Đăng xuất</button>`
      : g.composio
        ? `<span class="pill ok-pill">🧩 Đọc sheet qua Composio${g.composioAccount ? ` · tài khoản ${esc(g.composioAccount)}` : ' (tự tìm tài khoản khi đồng bộ)'}</span>`
        : g.configured
          ? `<a class="btn small google-btn" href="/auth/google?key=${encodeURIComponent(key)}">🔐 Đăng nhập Google để đọc sheet</a>`
          : '<span class="muted tiny">🔐 Chưa kết nối Google: đặt COMPOSIO_API_KEY (Composio) hoặc GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET trên server — xem README.</span>';
    $('#sheetStatus').textContent = A.sheet.lastAt
      ? `Lần cuối ${new Date(A.sheet.lastAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}: ${A.sheet.lastMsg}${A.sheet.auto ? ' · tự động mỗi 1 phút' : ''}`
      : 'Chưa đồng bộ lần nào.';
  }
  const sheetSettings = () => ({ type: 'sheet:config', url: $('#sheetUrl').value.trim(), approve: $('#sheetApprove').checked, auto: $('#sheetAuto').checked });
  socket.on('race:frame', () => {});

  async function action(a) {
    const res = await emit('admin:action', a);
    if (!res.ok && res.error) toast(res.error);
    return res;
  }

  if (!isMod) {
    addEventListener('keydown', (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') action({ type: 'next' });
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') action({ type: 'prev' });
    });
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const d = b.dataset;
    switch (d.a) {
      case 'next': case 'prev': return action({ type: d.a });
      case 'goto': return action({ type: 'goto', index: Number(d.i) });
      case 'reset-all': {
        const c = prompt('Xoá TẤT CẢ dữ liệu (check-in, vote, câu hỏi, feedback…). Gõ RESET để xác nhận:');
        if (c === 'RESET') { await action({ type: 'reset:all', confirm: 'RESET' }); toast('Đã reset'); }
        return;
      }
      case 'qa': return action({ type: 'qa:status', qid: d.id, status: d.s });
      case 'qa-add': {
        const box = $('#qaNew');
        const text = box.value.trim();
        if (text.length < 3) return toast('Nhập nội dung câu hỏi');
        const res = await action({ type: 'qa:add', text, pending: d.pending === '1' });
        if (res.ok) { box.value = ''; toast(d.pending === '1' ? 'Đã thêm vào chờ duyệt' : 'Đã thêm và hiển thị ✅'); }
        return;
      }
      case 'qr-toggle': return action({ type: 'qr:toggle' });
      case 'google-logout': if (confirm('Đăng xuất tài khoản Google khỏi server?')) action({ type: 'google:logout' }); return;
      case 'sheet-save': { const r = await action(sheetSettings()); if (r.ok) { sheetDirty = false; toast('Đã lưu'); } return; }
      case 'sheet-sync': {
        await action(sheetSettings());
        sheetDirty = false;
        b.disabled = true; b.textContent = '⏳ Đang đồng bộ…';
        const r = await emit('admin:action', { type: 'sheet:sync' });
        b.disabled = false; b.textContent = '🔄 Đồng bộ ngay';
        toast(r.ok ? `✅ ${r.msg}` : r.error, 4000);
        if (r.ok && r.added && !$('#sheetApprove').checked) { qaTab = 'pending'; renderQa(); }
        return;
      }
      case 'poll-view': return action({ type: 'poll:view', slideId: d.s });
      case 'qa-hl': return action({ type: 'qa:highlight', qid: d.id });
      case 'qa-del': if (confirm('Xoá câu hỏi này?')) action({ type: 'qa:delete', qid: d.id }); return;
      case 'tab': qaTab = d.t; return renderQa();
      case 'word': return action({ type: d.hid === '1' ? 'word:unhide' : 'word:hide', slideId: d.s, key: d.k });
      case 'words-reset': if (confirm('Xoá toàn bộ từ khoá của slide này?')) action({ type: 'words:reset', slideId: d.s }); return;
      case 'poll-toggle': return action({ type: 'poll:toggle', slideId: d.s });
      case 'poll-reveal': return action({ type: 'poll:reveal', slideId: d.s });
      case 'poll-timer': return action({ type: 'poll:timer', slideId: d.s, seconds: Number(d.t) });
      case 'qa-sort': qaSortAdmin = d.s; return renderQa();
      case 'poll-reset': if (confirm('Xoá toàn bộ phiếu vote?')) action({ type: 'poll:reset', slideId: d.s }); return;
      case 'race-start': return action({ type: 'race:start' });
      case 'race-rematch': return action({ type: 'race:rematch' });
      case 'brand-reset': {
        const r = await fetch(`/api/brand/${d.slot}?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
        toast(r.ok ? 'Đã trả về mặc định' : 'Lỗi');
        return renderBrand();
      }
      case 'race-reset': if (confirm('Xoá danh sách người chơi và tạo cuộc đua mới?')) action({ type: 'race:reset' }); return;
    }
  });

  function renderMain() {
    if (!S || !A) return;
    $('#stUsers').textContent = A.users.length;
    $('#curTitle').textContent = `${S.slideIndex + 1}. ${S.slide.title}${S.slide.speaker ? ' — ' + S.slide.speaker : ''}`;
    if (isMod) return;
    $('#qrBtn').textContent = S.bigQr ? '✖ Tắt QR toàn màn hình' : '📱 QR toàn màn hình';
    $('#qrBtn').classList.toggle('ok', !!S.bigQr);
    $('#stOnline').textContent = A.online;
    $('#curType').textContent = TYPE_LABEL[S.slide.type] || S.slide.type;
    $('#slideList').innerHTML = S.slides.map((sl, i) => `<li data-a="goto" data-i="${i}" class="${i === S.slideIndex ? 'on' : ''}"><span class="i">${i + 1}</span><div>${esc(sl.title)}${sl.speaker ? ' — ' + esc(sl.speaker) : ''}<small>${TYPE_LABEL[sl.type] || sl.type}</small></div></li>`).join('');
    const sig = JSON.stringify([S.slide.id, A.words, A.hiddenWords, A.polls, A.race, A.feedback, A.feedbackList.length, A.users.length]);
    if (sig === lastControlsSig) return;
    lastControlsSig = sig;
    $('#controls').innerHTML = (controls[S.slide.type] || (() => '<p class="muted">Không có điều khiển riêng cho slide này.</p>'))(S.slide);
    fitPreview();
  }

  const controls = {
    checkin: () => `<p><b>${A.users.length}</b> người đã check-in.</p>
      <div class="fb-list">${A.users.slice().reverse().slice(0, 80).map((u) => `<div>${esc(u.name)} <span class="muted">${esc(u.team || '')}</span></div>`).join('')}</div>`,
    wordcloud: (sl) => {
      const words = A.words[sl.id] || [];
      const hidden = A.hiddenWords[sl.id] || [];
      return `<p class="muted tiny">Bấm vào từ để ẩn/hiện khỏi word cloud (lọc từ không phù hợp).</p>
        <div class="words">${words.map((w) => `<button data-a="word" data-s="${sl.id}" data-k="${esc(w.key)}">${esc(w.text)} · ${w.count}</button>`).join('')}
        ${hidden.map((k) => `<button class="hid" data-a="word" data-hid="1" data-s="${sl.id}" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div>
        <div class="row"><button class="btn small bad" data-a="words-reset" data-s="${sl.id}">Xoá tất cả từ khoá</button></div>`;
    },
    poll: (sl) => {
      const p = A.polls[sl.id];
      const left = Math.ceil((p.endsIn || 0) / 1000);
      return `<div class="row"><button class="btn small ${p.open ? 'warn' : 'ok'}" data-a="poll-toggle" data-s="${sl.id}">${p.open ? '🔒 Đóng vote' : '🟢 Mở lại vote'}</button>
        <button class="btn small ${p.hidden ? 'ok' : 'ghost'}" data-a="poll-reveal" data-s="${sl.id}">${p.hidden ? '👁 Công bố kết quả' : '🙈 Ẩn kết quả'}</button>
        <button class="btn small bad" data-a="poll-reset" data-s="${sl.id}">Reset vote</button><span class="pill">${p.total} phiếu</span></div>
        ${!p.open && !p.hidden ? `<div class="row"><span class="muted tiny">Vote đã đóng → màn hình đang hiện:</span><button class="btn small ${p.view === 'all' ? 'ghost' : 'ok'}" data-a="poll-view" data-s="${sl.id}">${p.view === 'all' ? '📊 Toàn bộ (bấm để xem 🏆 Top 3)' : '🏆 Top 3 (bấm để xem 📊 toàn bộ)'}</button></div>` : '<p class="muted tiny">💡 Bấm 🔒 Đóng vote → màn hình tự hiện 🏆 Top 3.</p>'}
        <div class="row"><span class="muted tiny">Hẹn giờ đóng vote:</span>${[30, 60, 120, 300].map((t) => `<button class="btn small ghost" data-a="poll-timer" data-s="${sl.id}" data-t="${t}">${t < 60 ? t + 's' : t / 60 + ' phút'}</button>`).join('')}
        ${left ? `<span class="pill">⏱ còn ~${left}s</span>` : ''}</div>
        <div class="fb-list">${sl.options.map((o, i) => ({ o, c: p.counts[i] })).sort((a, b) => b.c - a.c).map((x, i) => `<div><b>${x.c}</b> · ${i === 0 && x.c ? '🏆 ' : ''}${esc(x.o)}</div>`).join('')}</div>`;
    },
    speaker: (sl) => `<p>Đang chiếu: <b>${esc(sl.speaker || `${sl.kicker || 'Mục'}: ${sl.title}`)}</b>${sl.topic ? ' — ' + esc(sl.topic) : ''}</p><p class="muted tiny">Khán giả có thể gửi câu hỏi trong lúc sharing; duyệt ở cột Q&A.</p>`,
    qa: () => `<p class="muted">Duyệt câu hỏi ở cột bên phải. ⭐ Highlight = hiển thị to trên màn hình (đang trả lời).</p>`,
    race: () => {
      const r = A.race;
      return `<p>Trạng thái: <b>${{ lobby: 'Chờ người chơi', countdown: 'Đếm ngược', racing: 'Đang đua', finished: 'Kết thúc' }[r.phase]}</b> · ${r.playerCount} vịt</p>
        <div class="row">
          <button class="btn ok" data-a="race-start" ${r.phase !== 'lobby' || !r.playerCount ? 'disabled' : ''}>🏁 Bắt đầu đua</button>
          <button class="btn small ghost" data-a="race-rematch" ${r.phase === 'racing' || r.phase === 'countdown' ? 'disabled' : ''}>🔁 Đua lại (giữ người chơi)</button>
          <button class="btn small bad" data-a="race-reset">Tạo cuộc đua mới</button>
        </div>
        ${r.finishOrder.length ? `<div class="fb-list">${r.finishOrder.slice(0, 10).map((p, i) => `<div>#${i + 1} ${esc(p.name)}</div>`).join('')}</div>` : ''}
        ${A.raceHistory.length ? `<p class="muted tiny">Lịch sử: ${A.raceHistory.map((h, i) => `Lượt ${i + 1}: 🥇 ${esc(h.podium[0]?.name || '')}`).join(' · ')}</p>` : ''}`;
    },
    feedback: () => {
      const f = A.feedback;
      return `<p><b>${f.count}</b> lượt · Tổng thể <b>${f.overall.toFixed(2)}</b> · Nội dung <b>${f.content.toFixed(2)}</b> · Tổ chức <b>${f.organization.toFixed(2)}</b></p>
        <div class="fb-list">${A.feedbackList.map((x) => `<div><b>${x.anonymous ? 'Ẩn danh' : esc(x.name)}</b> · ${'★'.repeat(x.overall)}${x.liked ? `<br>👍 ${esc(x.liked)}` : ''}${x.suggestion ? `<br>💡 ${esc(x.suggestion)}` : ''}${x.nextTopics ? `<br>📚 ${esc(x.nextTopics)}` : ''}</div>`).join('')}</div>`;
    },
  };

  function renderQa() {
    if (!A) return;
    const counts = { pending: 0, approved: 0, answered: 0, rejected: 0 };
    A.questions.forEach((q) => { counts[q.status] += 1; });
    const labels = { pending: '⏳ Chờ duyệt', approved: '✅ Đã duyệt', answered: '💬 Đã trả lời', rejected: '🚫 Từ chối' };
    $('#qaTabs').innerHTML = Object.keys(labels).map((t) => `<button data-a="tab" data-t="${t}" class="${qaTab === t ? 'on' : ''}">${labels[t]} (${counts[t]})</button>`).join('')
      + (qaTab === 'pending' ? '' : ` <span class="muted tiny">Sắp xếp:</span><button data-a="qa-sort" data-s="top" class="${qaSortAdmin === 'top' ? 'on' : ''}">🔥 Top</button><button data-a="qa-sort" data-s="new" class="${qaSortAdmin === 'new' ? 'on' : ''}">🕒 Mới nhất</button>`);
    const list = A.questions.filter((q) => q.status === qaTab).sort((a, b) => (qaTab === 'pending' ? a.createdAt - b.createdAt
      : qaSortAdmin === 'new' ? b.createdAt - a.createdAt : (b.highlighted - a.highlighted) || b.upvotes - a.upvotes));
    $('#qaList').innerHTML = list.length ? list.map((q) => `
      <div class="qa-item ${q.highlighted ? 'hl' : ''} ${q.flagged ? 'flag' : ''}">
        ${q.flagged ? '<div class="flag-note">⚠️ Có thể chứa từ ngữ không phù hợp — kiểm tra trước khi duyệt</div>' : ''}
        <div class="t">${esc(q.text)}</div>
        <div class="by">${esc(q.name)}${q.target ? ' → ' + esc(q.target) : ''} · ▲ ${q.upvotes} · ${new Date(q.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="row">
          ${q.status !== 'approved' ? `<button class="btn small ok" data-a="qa" data-s="approved" data-id="${q.id}">✅ Approve</button>` : ''}
          ${q.status === 'approved' ? `<button class="btn small warn" data-a="qa-hl" data-id="${q.id}">${q.highlighted ? '⭐ Bỏ highlight' : '⭐ Highlight'}</button>` : ''}
          ${q.status === 'approved' ? `<button class="btn small ghost" data-a="qa" data-s="answered" data-id="${q.id}">💬 Đã trả lời</button>` : ''}
          ${q.status !== 'rejected' ? `<button class="btn small bad" data-a="qa" data-s="rejected" data-id="${q.id}">🚫 Ẩn</button>` : ''}
          ${q.status !== 'pending' ? `<button class="btn small ghost" data-a="qa" data-s="pending" data-id="${q.id}">↩ Chờ duyệt</button>` : ''}
          <button class="btn small ghost" data-a="qa-del" data-id="${q.id}">🗑</button>
        </div>
      </div>`).join('') : '<p class="muted">Không có câu hỏi.</p>';
  }
})();

/* MC page: pick which approved question goes on the big screen, mark answered, move to the next. */
(() => {
  const { socket, $, esc, toast, emit } = TH;
  const params = new URLSearchParams(location.search);
  let key = params.get('key');
  try { key = key || sessionStorage.getItem('th_mc_key'); } catch {}
  let S = null;
  let tab = 'top';

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

  socket.on('state', (s) => { if (!s.slides) return; S = s; render(); });

  async function action(a) {
    const res = await emit('admin:action', a);
    if (!res.ok) toast(res.error === 'unauthorized' ? 'Không có quyền' : res.error || 'Lỗi');
    return res;
  }

  $('#toQa').onclick = () => {
    const i = S.slides.findIndex((x) => x.type === 'qa');
    if (i >= 0) action({ type: 'goto', index: i });
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
    }
  });

  function render() {
    if (!S) return;
    $('#curTitle').textContent = `${S.slideIndex + 1}. ${S.slide.title}`;
    $('#toQa').classList.toggle('hidden', S.slide.type === 'qa');
    const cur = S.questions.find((q) => q.highlighted);
    $('#nowText').innerHTML = cur
      ? `“${esc(cur.text)}”<div class="mc-meta">▲ ${cur.upvotes} upvote${cur.target ? ' · → ' + esc(cur.target) : ''}</div>`
      : '<span class="muted">Chưa chọn câu nào — bấm 🎤 ở danh sách bên dưới.</span>';
    $('#btnAnswered').disabled = !cur;
    $('#btnClear').disabled = !cur;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));

    let list = S.questions.filter((q) => (tab === 'answered' ? q.status === 'answered' : q.status === 'approved' && !q.highlighted));
    list = tab === 'new' ? list.sort((a, b) => b.createdAt - a.createdAt) : list.sort((a, b) => b.upvotes - a.upvotes || a.createdAt - b.createdAt);
    $('#listTitle').textContent = tab === 'answered' ? `Đã trả lời (${list.length})` : `Câu hỏi đã duyệt, chưa trả lời (${list.length})`;
    $('#list').innerHTML = list.length ? list.map((q) => `
      <div class="mc-item">
        <div class="mc-votes">▲ ${q.upvotes}</div>
        <div class="mc-q">${esc(q.text)}<div class="mc-meta">${esc(q.name)}${q.target ? ' · → ' + esc(q.target) : ''} · ${new Date(q.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div></div>
        ${tab === 'answered'
          ? `<button class="btn small ghost" data-a="reopen" data-id="${q.id}">↩ Mở lại</button>`
          : `<button class="btn" data-a="pick" data-id="${q.id}">🎤 Chọn</button>`}
      </div>`).join('')
      : `<p class="muted">${tab === 'answered' ? 'Chưa có câu nào được trả lời.' : 'Chưa có câu hỏi nào được moderator duyệt.'}</p>`;
  }
})();

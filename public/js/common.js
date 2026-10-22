/* Shared client helpers. Loaded after /socket.io/socket.io.js */
window.TH = (() => {
  const socket = io({ transports: ['websocket', 'polling'] });

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let toastTimer;
  function toast(msg, ms = 2200) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function emit(event, payload) {
    return new Promise((resolve) => {
      const done = (res) => resolve(res || { ok: false, error: 'Không có phản hồi' });
      const t = setTimeout(() => done({ ok: false, error: 'Mất kết nối, thử lại nhé' }), 6000);
      const cb = (res) => { clearTimeout(t); done(res); };
      payload === undefined ? socket.emit(event, cb) : socket.emit(event, payload, cb);
    });
  }

  // Connection indicator.
  const conn = document.createElement('div');
  conn.className = 'conn hidden';
  conn.textContent = 'Đang kết nối lại…';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(conn));
  socket.on('connect', () => conn.classList.add('hidden'));
  socket.on('disconnect', () => conn.classList.remove('hidden'));

  // Branding uploaded from admin: reload logos/background without a page refresh.
  socket.on('brand', (slot) => {
    const v = Date.now();
    document.querySelectorAll(`img[src^="/brand/${slot}"]`).forEach((img) => { img.src = `/brand/${slot}?v=${v}`; });
    if (slot === 'bg' || slot === 'bg-mobile') {
      const bg = document.querySelector('.bg');
      if (bg) bg.style.backgroundImage = `url('/brand/${matchMedia('(max-aspect-ratio: 1/1)').matches ? 'bg-mobile' : 'bg'}?v=${v}')`;
    }
  });

  // Floating particles over the AI background.
  function particles(canvas, count = 60) {
    const ctx = canvas.getContext('2d');
    let w, h, dpr;
    const ps = [];
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.width = innerWidth * dpr; h = canvas.height = innerHeight * dpr;
      canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    }
    resize(); addEventListener('resize', resize);
    for (let i = 0; i < count; i++) ps.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0004, vy: (Math.random() - .5) * .0004, r: 1 + Math.random() * 2 });
    (function frame() {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.x = (p.x + p.vx + 1) % 1; p.y = (p.y + p.vy + 1) % 1;
      }
      ctx.lineWidth = dpr * .6;
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const dx = (ps[i].x - ps[j].x) * w, dy = (ps[i].y - ps[j].y) * h, d = Math.hypot(dx, dy), m = 150 * dpr;
        if (d < m) { ctx.strokeStyle = `rgba(255,170,215,${(1 - d / m) * .25})`; ctx.beginPath(); ctx.moveTo(ps[i].x * w, ps[i].y * h); ctx.lineTo(ps[j].x * w, ps[j].y * h); ctx.stroke(); }
      }
      for (const p of ps) { ctx.fillStyle = 'rgba(255,210,235,.8)'; ctx.beginPath(); ctx.arc(p.x * w, p.y * h, p.r * dpr, 0, 7); ctx.fill(); }
      requestAnimationFrame(frame);
    })();
  }

  // Draws a cartoon duck facing right, centered at (x, y), body width ~ 2.2*s.
  function drawDuck(ctx, x, y, s, color, bob = 0, flap = 0) {
    ctx.save();
    ctx.translate(x, y + Math.sin(bob) * s * 0.08);
    // ripple
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.ellipse(-s * .1, s * .62, s * 1.25, s * .18, 0, 0, 7); ctx.fill();
    // body
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(-s * .1, s * .15, s * 1.05, s * .62, 0, 0, 7); ctx.fill();
    // tail
    ctx.beginPath(); ctx.moveTo(-s * 1.0, s * .0); ctx.lineTo(-s * 1.35, -s * .35); ctx.lineTo(-s * .8, -s * .15); ctx.fill();
    // wing
    ctx.fillStyle = 'rgba(0,0,0,.14)';
    ctx.beginPath(); ctx.ellipse(-s * .25, s * .1 - flap * s * .1, s * .5, s * .3, -0.25 - flap * .3, 0, 7); ctx.fill();
    // head
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(s * .7, -s * .45, s * .45, 0, 7); ctx.fill();
    // beak
    ctx.fillStyle = '#ff922b';
    ctx.beginPath(); ctx.moveTo(s * 1.05, -s * .5); ctx.quadraticCurveTo(s * 1.5, -s * .42, s * 1.08, -s * .28); ctx.closePath(); ctx.fill();
    // eye
    ctx.fillStyle = '#1a0010'; ctx.beginPath(); ctx.arc(s * .82, -s * .58, s * .08, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * .845, -s * .605, s * .03, 0, 7); ctx.fill();
    ctx.restore();
  }

  return { socket, $, esc, toast, emit, particles, drawDuck };
})();

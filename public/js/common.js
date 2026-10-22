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

  // Shade a #rrggbb colour: amt > 0 lightens, < 0 darkens.
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) : c) * amt)));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  // Rubber duck facing right, centred at (x, y) on the waterline; body length ~ 2.3*s.
  // opts: bob (phase), no (number badge), speed (0..1, wake size), flap (-1..1)
  function drawDuck(ctx, x, y, s, color, opts = {}) {
    if (typeof opts === 'number') opts = { bob: opts };
    const { bob = 0, no = 0, speed = 0, flap = 0 } = opts;
    const dark = shade(color, -0.28), light = shade(color, 0.45);
    ctx.save();
    ctx.translate(x, y + Math.sin(bob) * s * 0.06);
    ctx.rotate(Math.sin(bob * 0.9) * 0.04 - speed * 0.06);
    // wake: foam V behind the duck, longer when fast
    if (speed > 0.05) {
      const len = s * (0.8 + speed * 2.6);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + speed * 0.4})`;
      ctx.lineWidth = s * 0.09; ctx.lineCap = 'round';
      for (const k of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.42);
        ctx.quadraticCurveTo(-s * 0.7 - len * 0.5, s * 0.42 + k * s * 0.15, -s * 0.7 - len, s * 0.42 + k * s * (0.25 + speed * 0.45));
        ctx.stroke();
      }
    }
    // reflection
    ctx.fillStyle = 'rgba(0,30,60,.25)';
    ctx.beginPath(); ctx.ellipse(-s * 0.05, s * 0.58, s * 1.15, s * 0.2, 0, 0, 7); ctx.fill();
    // body + tail
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-s * 1.05, -s * 0.05);
    ctx.quadraticCurveTo(-s * 1.25, -s * 0.62, -s * 0.78, -s * 0.38);
    ctx.quadraticCurveTo(-s * 0.2, -s * 0.2, s * 0.35, -s * 0.12);
    ctx.quadraticCurveTo(s * 1.05, -s * 0.05, s * 0.95, s * 0.28);
    ctx.quadraticCurveTo(s * 0.8, s * 0.62, 0, s * 0.62);
    ctx.quadraticCurveTo(-s * 0.95, s * 0.62, -s * 1.05, -s * 0.05);
    ctx.fill();
    // belly shade
    ctx.fillStyle = dark; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.ellipse(0, s * 0.45, s * 0.9, s * 0.18, 0, 0, Math.PI); ctx.fill();
    ctx.globalAlpha = 1;
    // wing
    ctx.fillStyle = dark; ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.ellipse(-s * 0.22, s * 0.1 - flap * s * 0.06, s * 0.45, s * 0.24, -0.35 - flap * 0.25, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    // head
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.58, s * 0.44, 0, 7); ctx.fill();
    // beak
    ctx.fillStyle = '#ff8c1a';
    ctx.beginPath(); ctx.moveTo(s * 0.88, -s * 0.62);
    ctx.quadraticCurveTo(s * 1.42, -s * 0.66, s * 1.3, -s * 0.48);
    ctx.quadraticCurveTo(s * 1.15, -s * 0.36, s * 0.9, -s * 0.42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e06d00';
    ctx.beginPath(); ctx.moveTo(s * 0.9, -s * 0.5); ctx.quadraticCurveTo(s * 1.15, -s * 0.47, s * 1.28, -s * 0.5);
    ctx.quadraticCurveTo(s * 1.12, -s * 0.38, s * 0.9, -s * 0.42); ctx.fill();
    // cheek + eye
    ctx.fillStyle = 'rgba(255,90,150,.45)'; ctx.beginPath(); ctx.arc(s * 0.68, -s * 0.44, s * 0.09, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a0010'; ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.7, s * 0.085, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * 0.725, -s * 0.73, s * 0.032, 0, 7); ctx.fill();
    // gloss
    ctx.fillStyle = light; ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.ellipse(s * 0.4, -s * 0.8, s * 0.14, s * 0.07, -0.6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.15, -s * 0.05, s * 0.28, s * 0.06, -0.15, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    // number badge
    if (no) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-s * 0.5, s * 0.2, s * 0.26, 0, 7); ctx.fill();
      ctx.fillStyle = '#1a0010';
      ctx.font = `900 ${Math.round(s * (no > 99 ? 0.24 : 0.3))}px "Be Vietnam Pro", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(no, -s * 0.5, s * 0.215);
    }
    // waterline foam
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = s * 0.06;
    ctx.beginPath(); ctx.ellipse(0, s * 0.56, s * 0.95, s * 0.09, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }

  return { socket, $, esc, toast, emit, particles, drawDuck, shade };
})();

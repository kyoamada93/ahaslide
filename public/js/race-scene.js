/* Duck race river scene for the big screen.
 * A long river (several screens wide) with a camera that follows the leading pack,
 * parallax hills, riverbanks, buoys, start gate and finish arch. */
window.RaceScene = (() => {
  const { drawDuck } = TH;
  const GOLD = 0.6180339887;

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    let frame = { phase: 'lobby', ducks: [], t: 0 };
    const shown = new Map(); // id -> {p: displayed progress, v: smoothed speed 0..1, last}
    const splashes = [];
    let camX = 0;
    let tick = 0;
    let raf = null;
    const sprites = new Map(); // "color|no|size" -> pre-rendered duck (drawing 300 ducks from paths each frame is too slow)

    // layout (fractions of H)
    const SKY = 0.17, FAR_BANK = 0.09, NEAR_BANK = 0.1;
    const worldLen = () => W * 3.2;              // river length in px
    const startX = () => W * 0.1;
    const finishX = () => worldLen() - W * 0.12;
    const riverTop = () => H * (SKY + FAR_BANK);
    const riverBot = () => H * (1 - NEAR_BANK);

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, devicePixelRatio || 1);
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (w !== W || h !== H) { W = canvas.width = w; H = canvas.height = h; }
    }

    function setFrame(f) {
      const now = performance.now();
      for (const d of f.ducks) {
        const e = shown.get(d[0]);
        if (!e) { shown.set(d[0], { p: d[3], v: 0, target: d[3], last: now, lastP: d[3] }); continue; }
        const dt = Math.max(50, now - e.last);
        const inst = Math.max(0, d[3] - e.lastP) / dt * 1000; // progress %/s
        e.v = e.v * 0.6 + Math.min(1, inst / 9) * 0.4;
        e.target = d[3]; e.last = now; e.lastP = d[3];
      }
      if (f.phase === 'lobby') for (const e of shown.values()) { e.p = 0; e.target = 0; e.lastP = 0; e.v = 0; }
      frame = f;
    }

    // ------------------------------------------------------------------ layers
    function sky() {
      const g = ctx.createLinearGradient(0, 0, 0, H * SKY);
      g.addColorStop(0, '#3d0029'); g.addColorStop(0.55, '#a50064'); g.addColorStop(1, '#ff8ab8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * SKY + 2);
      // sun
      const sx = W * 0.78 - camX * 0.03, sy = H * SKY * 0.62;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.12);
      sg.addColorStop(0, 'rgba(255,240,200,.95)'); sg.addColorStop(0.25, 'rgba(255,200,170,.6)'); sg.addColorStop(1, 'rgba(255,150,190,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H * SKY);
      // hills (two parallax layers)
      hills(0.12, H * SKY * 0.55, H * SKY * 0.35, '#6b0a47', 0.0021);
      hills(0.25, H * SKY * 0.75, H * SKY * 0.3, '#4a0532', 0.0035);
    }
    function hills(par, base, amp, col, freq) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, H * SKY + 2);
      for (let x = 0; x <= W; x += 12 * dpr) {
        const wx = (x + camX * par) / dpr;
        ctx.lineTo(x, base + Math.sin(wx * freq) * amp * 0.5 + Math.sin(wx * freq * 2.7 + 1) * amp * 0.25);
      }
      ctx.lineTo(W, H * SKY + 2); ctx.closePath(); ctx.fill();
    }

    function bank(top, h, far) {
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, far ? '#2f9e44' : '#37b24d'); g.addColorStop(1, far ? '#2b8a3e' : '#2f9e44');
      ctx.fillStyle = g; ctx.fillRect(0, top, W, h);
      // sandy edge
      ctx.fillStyle = '#e9c46a';
      if (far) ctx.fillRect(0, top + h - 5 * dpr, W, 5 * dpr); else ctx.fillRect(0, top, W, 5 * dpr);
      // decorations at fixed world positions
      const step = 140 * dpr;
      const first = Math.floor(camX / step) - 1;
      for (let i = first; i < first + W / step + 3; i++) {
        const x = i * step - camX;
        const seed = Math.abs(Math.sin(i * 12.9898 + (far ? 1 : 7)) * 43758.5453) % 1;
        if (far) {
          if (seed < 0.55) tree(x + seed * 60 * dpr, top + h * 0.75, h * (0.9 + seed * 0.5), seed);
          else flowers(x, top + h * 0.6, seed);
          if (i % 3 === 0) bunting(x, top + h * 0.15);
        } else {
          reeds(x + seed * 80 * dpr, top + h * 0.35, h * 0.7, seed);
          if (seed > 0.7) stone(x + 50 * dpr, top + h * 0.6, h * 0.25);
        }
      }
    }
    function tree(x, base, h, seed) {
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(x - h * 0.06, base - h * 0.4, h * 0.12, h * 0.42);
      ctx.fillStyle = seed < 0.25 ? '#ff6fb5' : '#2b8a3e'; // MoMo-pink blossom trees between green ones
      ctx.beginPath(); ctx.arc(x, base - h * 0.62, h * 0.36, 0, 7); ctx.arc(x - h * 0.22, base - h * 0.45, h * 0.24, 0, 7); ctx.arc(x + h * 0.22, base - h * 0.45, h * 0.24, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(x - h * 0.1, base - h * 0.75, h * 0.12, 0, 7); ctx.fill();
    }
    function flowers(x, y, seed) {
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = ['#ffd43b', '#ff6fb5', '#fff', '#f783ac'][k % 4];
        ctx.beginPath(); ctx.arc(x + k * 14 * dpr, y + Math.sin(k + seed * 9) * 6 * dpr, 4 * dpr, 0, 7); ctx.fill();
      }
    }
    function bunting(x, y) {
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 70 * dpr, y + 16 * dpr, x + 140 * dpr, y); ctx.stroke();
      for (let k = 1; k < 7; k++) {
        const fx = x + k * 20 * dpr, fy = y + Math.sin((k / 7) * Math.PI) * 9 * dpr;
        ctx.fillStyle = k % 2 ? '#a50064' : '#ffd6ec';
        ctx.beginPath(); ctx.moveTo(fx - 6 * dpr, fy); ctx.lineTo(fx + 6 * dpr, fy); ctx.lineTo(fx, fy + 14 * dpr); ctx.fill();
      }
    }
    function reeds(x, y, h, seed) {
      ctx.strokeStyle = '#2b8a3e'; ctx.lineWidth = 3 * dpr; ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const sway = Math.sin(tick * 0.03 + k + seed * 5) * 6 * dpr;
        ctx.beginPath(); ctx.moveTo(x + k * 7 * dpr, y + h); ctx.quadraticCurveTo(x + k * 7 * dpr, y + h * 0.4, x + k * 7 * dpr + sway, y); ctx.stroke();
      }
      ctx.fillStyle = '#795548'; ctx.fillRect(x + 12 * dpr + Math.sin(tick * 0.03) * 3, y - 6 * dpr, 6 * dpr, 16 * dpr);
    }
    function stone(x, y, r) {
      ctx.fillStyle = '#868e96'; ctx.beginPath(); ctx.ellipse(x, y, r * 1.4, r, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.35, r * 0.5, r * 0.25, 0, 0, 7); ctx.fill();
    }

    function water() {
      const top = riverTop(), bot = riverBot();
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, '#1c7ed6'); g.addColorStop(0.5, '#1971c2'); g.addColorStop(1, '#1864ab');
      ctx.fillStyle = g; ctx.fillRect(0, top, W, bot - top);
      // drifting ripples
      ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.lineWidth = 2 * dpr; ctx.lineCap = 'round';
      const rows = 12;
      for (let r = 0; r < rows; r++) {
        const y = top + (r + 0.5) * (bot - top) / rows;
        const off = (camX * 1 + tick * 0.6 * dpr + r * 97) % (120 * dpr);
        for (let x = -off; x < W; x += 120 * dpr) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 15 * dpr, y - 5 * dpr, x + 30 * dpr, y); ctx.stroke();
        }
      }
      // sparkles
      for (let k = 0; k < 40; k++) {
        const sx = ((k * 211.7 - camX * 1 - tick * 0.4 * dpr) % W + W) % W;
        const sy = top + ((k * GOLD) % 1) * (bot - top);
        const a = (Math.sin(tick * 0.08 + k) + 1) * 0.25;
        ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(sx, sy, 6 * dpr, 2 * dpr);
      }
      // lily pads
      for (let k = 0; k < 18; k++) {
        const wx = (k * 731) % worldLen();
        const x = wx - camX;
        if (x < -60 * dpr || x > W + 60 * dpr) continue;
        const y = top + (k % 2 ? 0.06 : 0.94) * (bot - top);
        ctx.fillStyle = '#40c057';
        ctx.beginPath(); ctx.ellipse(x, y, 26 * dpr, 12 * dpr, 0, 0.4, Math.PI * 2); ctx.lineTo(x, y); ctx.fill();
        if (k % 3 === 0) { ctx.fillStyle = '#ffdeeb'; ctx.beginPath(); ctx.arc(x + 6 * dpr, y - 3 * dpr, 6 * dpr, 0, 7); ctx.fill(); }
      }
      // buoy ropes splitting the river into bands
      const bands = 4;
      for (let b = 1; b < bands; b++) {
        const y = top + (b / bands) * (bot - top);
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        const step = 90 * dpr;
        for (let wx = Math.floor(camX / step) * step; wx < camX + W + step; wx += step) {
          ctx.fillStyle = (wx / step) % 2 ? '#fff' : '#ff3d7f';
          ctx.beginPath(); ctx.arc(wx - camX, y + Math.sin(tick * 0.05 + wx) * 2 * dpr, 7 * dpr, 0, 7); ctx.fill();
        }
      }
    }

    function gates() {
      const top = H * SKY, bot = riverBot() + H * NEAR_BANK * 0.3;
      // distance markers
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const pct of [25, 50, 75]) {
        const x = startX() + (finishX() - startX()) * pct / 100 - camX;
        if (x < -100 || x > W + 100) continue;
        ctx.fillStyle = '#fff'; ctx.fillRect(x - 3 * dpr, top + H * FAR_BANK * 0.1, 6 * dpr, H * FAR_BANK * 0.9);
        roundRect(x - 40 * dpr, top + 4 * dpr, 80 * dpr, 34 * dpr, 10 * dpr, '#a50064');
        ctx.fillStyle = '#fff'; ctx.font = `800 ${18 * dpr}px "Be Vietnam Pro", sans-serif`;
        ctx.fillText(pct + '%', x, top + 21 * dpr);
      }
      // start line
      const sx = startX() - camX;
      if (sx > -50) {
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(sx - 3 * dpr, riverTop(), 6 * dpr, riverBot() - riverTop());
        banner(sx, top, 'START', '#1a0010');
      }
      // finish arch
      const fx = finishX() - camX;
      if (fx < W + 200) {
        const sq = 14 * dpr;
        for (let y = riverTop(), r = 0; y < riverBot(); y += sq, r++) for (let c = 0; c < 2; c++) {
          ctx.fillStyle = (r + c) % 2 ? '#fff' : '#111'; ctx.fillRect(fx + c * sq, y, sq, sq);
        }
        ctx.fillStyle = '#a50064';
        ctx.fillRect(fx - 10 * dpr, top - H * 0.08, 16 * dpr, bot - top + H * 0.08);
        banner(fx + sq, top - H * 0.04, 'FINISH 🏁', '#a50064', true);
      }
    }
    function banner(x, y, text, bg, checker) {
      ctx.font = `900 ${26 * dpr}px "Be Vietnam Pro", sans-serif`;
      const w = ctx.measureText(text).width + 40 * dpr, h = 46 * dpr;
      roundRect(x - w / 2, y - h / 2, w, h, 12 * dpr, bg);
      if (checker) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * dpr; ctx.strokeRect(x - w / 2 + 4 * dpr, y - h / 2 + 4 * dpr, w - 8 * dpr, h - 8 * dpr); }
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
    }
    function roundRect(x, y, w, h, r, fill) {
      ctx.fillStyle = fill; ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.fill();
    }

    // ------------------------------------------------------------------ ducks
    function ducks() {
      const list = frame.ducks;
      const n = list.length;
      if (!n) return;
      const top = riverTop() + 30 * dpr, bot = riverBot() - 22 * dpr;
      const base = Math.max(14, Math.min(40, 300 / Math.sqrt(n + 4))) * dpr;
      const ranked = [...list].sort((a, b) => (shown.get(b[0])?.p || 0) - (shown.get(a[0])?.p || 0));
      const labelled = new Set(ranked.slice(0, n <= 30 ? n : 10).map((d) => d[0]));
      const leader = ranked[0]?.[0];
      const items = list.map((d, i) => {
        const e = shown.get(d[0]) || { p: d[3], v: 0, target: d[3] };
        e.p += ((e.target ?? d[3]) - e.p) * 0.15;
        const depth = n === 1 ? 0.5 : (i * GOLD) % 1; // spread ducks across the river
        const y = top + depth * (bot - top);
        const scale = 0.78 + depth * 0.38; // perspective: nearer = bigger
        const x = startX() + (finishX() - startX()) * (e.p / 100);
        return { d, e, x, y, s: base * scale, i };
      }).sort((a, b) => a.y - b.y);

      for (const it of items) {
        const x = it.x - camX;
        if (x < -120 * dpr || x > W + 120 * dpr) continue;
        const sp = frame.phase === 'racing' ? it.e.v : 0;
        if (sp > 0.45 && Math.random() < sp * 0.5 && splashes.length < 500) {
          splashes.push({ x: it.x - it.s * 0.9, y: it.y + it.s * 0.4, vx: -(1 + Math.random() * 2) * dpr, vy: -(1 + Math.random() * 2.5) * dpr, life: 1, r: (2 + Math.random() * 3) * dpr });
        }
        if (sp > 0.05) wake(x, it.y, it.s, sp);
        const img = sprite(it.d[2], it.d[5], it.s);
        const bob = tick * 0.12 + it.i;
        ctx.save();
        ctx.translate(x, it.y + Math.sin(bob) * it.s * 0.06);
        ctx.rotate(Math.sin(bob * 0.9) * 0.04 - sp * 0.06);
        ctx.drawImage(img, -img._ox, -img._oy);
        ctx.restore();
      }
      // splashes
      for (let k = splashes.length - 1; k >= 0; k--) {
        const p = splashes[k];
        p.x += p.vx; p.y += p.vy; p.vy += 0.25 * dpr; p.life -= 0.04;
        if (p.life <= 0) { splashes.splice(k, 1); continue; }
        ctx.fillStyle = `rgba(255,255,255,${p.life * 0.8})`;
        ctx.beginPath(); ctx.arc(p.x - camX, p.y, p.r, 0, 7); ctx.fill();
      }
      // name tags on top
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const it of items) {
        if (!labelled.has(it.d[0])) continue;
        const x = it.x - camX;
        if (x < -120 * dpr || x > W + 120 * dpr) continue;
        const fs = Math.round(Math.max(13 * dpr, it.s * 0.42));
        ctx.font = `800 ${fs}px "Be Vietnam Pro", sans-serif`;
        const label = (it.d[0] === leader && frame.phase !== 'lobby' && it.e.p > 1 ? '👑 ' : '') + it.d[1];
        const w = ctx.measureText(label).width + fs * 0.9;
        const ty = it.y - it.s * 1.35;
        roundRect(x - w / 2, ty - fs * 0.75, w, fs * 1.5, fs * 0.75, 'rgba(26,0,16,.72)');
        ctx.fillStyle = it.d[2]; ctx.beginPath(); ctx.moveTo(x - 5 * dpr, ty + fs * 0.75); ctx.lineTo(x + 5 * dpr, ty + fs * 0.75); ctx.lineTo(x, ty + fs * 0.75 + 7 * dpr); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(label, x, ty + 1);
      }
    }

    function sprite(color, no, s) {
      const size = Math.round(s);
      const key = color + '|' + no + '|' + size;
      let c = sprites.get(key);
      if (!c) {
        c = document.createElement('canvas');
        c.width = Math.ceil(size * 3); c.height = Math.ceil(size * 2.1);
        c._ox = size * 1.4; c._oy = size * 1.25;
        drawDuck(c.getContext('2d'), c._ox, c._oy, size, color, { no });
        if (sprites.size > 1500) sprites.clear();
        sprites.set(key, c);
      }
      return c;
    }
    function wake(x, y, s, speed) {
      const len = s * (0.8 + speed * 2.6);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + speed * 0.4})`;
      ctx.lineWidth = s * 0.09; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const k of [-1, 1]) {
        ctx.moveTo(x - s * 0.7, y + s * 0.42);
        ctx.quadraticCurveTo(x - s * 0.7 - len * 0.5, y + s * 0.42 + k * s * 0.15, x - s * 0.7 - len, y + s * 0.42 + k * s * (0.25 + speed * 0.45));
      }
      ctx.stroke();
    }

    function updateCamera() {
      let target = 0;
      if (frame.phase === 'racing' || frame.phase === 'finished') {
        let lead = 0;
        for (const e of shown.values()) lead = Math.max(lead, e.p);
        const leadX = startX() + (finishX() - startX()) * lead / 100;
        target = leadX - W * 0.68;
      }
      target = Math.max(0, Math.min(worldLen() - W, target));
      camX += (target - camX) * 0.06;
    }

    function loop() {
      raf = requestAnimationFrame(loop);
      tick++;
      resize();
      if (!W || !H) return;
      updateCamera();
      ctx.clearRect(0, 0, W, H);
      sky();
      bank(H * SKY, H * FAR_BANK, true);
      water();
      gates();
      ducks();
      bank(riverBot(), H * NEAR_BANK, false);
    }

    return {
      start() { if (!raf) loop(); },
      stop() { cancelAnimationFrame(raf); raf = null; },
      setFrame,
      reset() { shown.clear(); splashes.length = 0; camX = 0; },
      // progress along the course for the mini-map: [{id, name, color, p, no}]
      standings() {
        return frame.ducks.map((d) => ({ id: d[0], name: d[1], color: d[2], p: shown.get(d[0])?.p ?? d[3], rank: d[4], no: d[5] }))
          .sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9) || b.p - a.p);
      },
    };
  }
  return { create };
})();

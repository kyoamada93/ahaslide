/* Shared-element Morph using browser animations, with no framework or snapshot API dependency. */
window.TownhallMorph = (() => {
  const duration = 720;
  const easing = 'cubic-bezier(.22, 1, .36, 1)';
  const selectors = ['h1', '.kicker', '.sub', '.qr-card', '.avatar', '.topic', '.agenda',
    '.ask', '.poll-box', '.qa-grid', '.cloud-wrap', '.race-stage', '.stats', '.big-count', '.names'];

  function elements(slide) {
    const result = new Map();
    for (const selector of selectors) {
      const el = slide.querySelector(selector);
      if (el) result.set(selector, { el, rect: el.getBoundingClientRect() });
    }
    return result;
  }

  function create(stage) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let animations = [], ghost = null, timer = null;
    function finish() {
      clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
      animations = [];
      ghost?.remove(); ghost = null;
      delete stage.dataset.morphing;
    }
    reduced.addEventListener('change', () => { if (reduced.matches) finish(); });
    function animate(el, frames, ms = duration) {
      animations.push(el.animate(frames, { duration: ms, easing, fill: 'both' }));
    }
    function capture() {
      // Complete any previous animation before measuring the next destination.
      finish();
      const current = stage.firstElementChild;
      if (!current || reduced.matches || typeof current.animate !== 'function') return null;
      const rect = current.getBoundingClientRect();
      const previous = elements(current);
      ghost = current.cloneNode(true);
      ghost.classList.add('morph-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.setAttribute('inert', '');
      ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      // cloneNode does not copy canvas pixels (cloud and race). Freeze their current frame.
      const copies = ghost.querySelectorAll('canvas');
      current.querySelectorAll('canvas').forEach((canvas, i) => {
        if (canvas.width && canvas.height) copies[i].getContext('2d')?.drawImage(canvas, 0, 0);
      });
      Object.assign(ghost.style, { left: rect.left + 'px', top: rect.top + 'px',
        width: rect.width + 'px', height: rect.height + 'px' });
      document.body.appendChild(ghost);
      return { previous, copies: elements(ghost) };
    }
    function play(snapshot) {
      const next = stage.firstElementChild;
      if (!snapshot || !next) return;
      stage.dataset.morphing = 'true';
      animate(ghost, [{ opacity: 1 }, { opacity: 0 }], 420);
      animate(next, [{ opacity: 0 }, { opacity: 1 }], 460);
      const target = elements(next);
      for (const [key, to] of target) {
        const from = snapshot.previous.get(key);
        const old = snapshot.copies.get(key)?.el;
        if (!from || !old || !from.rect.width || !from.rect.height || !to.rect.width || !to.rect.height) continue;
        const dx = from.rect.left - to.rect.left, dy = from.rect.top - to.rect.top;
        to.el.style.transformOrigin = 'top left';
        old.style.transformOrigin = 'top left';
        const same = from.el.textContent === to.el.textContent;
        animate(to.el, [
          { transform: `translate(${dx}px, ${dy}px) scale(${from.rect.width / to.rect.width}, ${from.rect.height / to.rect.height})`, opacity: same ? 1 : 0 },
          { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
        ]);
        if (same) old.style.visibility = 'hidden';
        else animate(old, [
          { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
          { transform: `translate(${-dx}px, ${-dy}px) scale(${to.rect.width / from.rect.width}, ${to.rect.height / from.rect.height})`, opacity: 0 },
        ]);
      }
      timer = setTimeout(finish, duration + 40);
    }
    addEventListener('resize', finish);
    return { capture, play };
  }
  return { create };
})();

// Portfolio lock - smooth realistic glass shatter unlock
class PortfolioLock {
  constructor() {
    this.sessionKey = 'portfolio_unlocked';
    this.init();
  }

  init() {
    if (sessionStorage.getItem(this.sessionKey) === 'true') {
      this.unlockInstant();
      return;
    }
    document.body.classList.add('portfolio-is-locked');
    this.bindForm();
    this.focusNameInput();
  }

  focusNameInput() {
    const input = document.getElementById('visitor-name');
    if (!input) return;
    requestAnimationFrame(() => {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    });
  }

  bindForm() {
    const form = document.getElementById('unlock-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit(e);
    });

    form.querySelectorAll('input').forEach((input) => {
      const group = () => input.closest('.form-group');
      input.addEventListener('focus', () => group()?.classList.add('focused'));
      input.addEventListener('blur', () => {
        if (!input.value.trim()) group()?.classList.remove('focused');
      });
      input.addEventListener('input', () => {
        if (input.value.trim()) group()?.classList.add('focused');
      });
    });
  }

  async handleSubmit(e) {
    const form = e.currentTarget;
    const nameInput = document.getElementById('visitor-name');
    const name = nameInput?.value.trim() || '';
    if (!name) {
      this.notify('Please enter your name', 'error');
      nameInput?.focus();
      return;
    }

    const btn = form.querySelector('.unlock-btn');
    const btnText = btn?.querySelector('.btn-text');
    const btnIcon = btn?.querySelector('.btn-icon');
    const btnLoader = btn?.querySelector('.btn-loader');
    if (!btn || !btnText || !btnLoader) return;

    btn.disabled = true;
    btnText.style.display = 'none';
    if (btnIcon) btnIcon.style.display = 'none';
    btnLoader.style.display = 'inline';

    try {
      await this.sendVisitorData(name);
      sessionStorage.setItem(this.sessionKey, 'true');
      await this.playUnlock(name);
    } catch {
      this.notify('Something went wrong. Please try again.', 'error');
      btn.disabled = false;
      btnText.style.display = 'inline';
      if (btnIcon) btnIcon.style.display = '';
      btnLoader.style.display = 'none';
    }
  }

  async sendVisitorData(name) {
    try {
      const res = await fetch('https://formcarry.com/s/stV_oddEgaZ', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name,
          message: `Portfolio visitor: ${name} - ${new Date().toLocaleString()}`,
          subject: 'New Portfolio Visitor! 🎉',
        }),
      });
      if (!res.ok) throw new Error('submit failed');
    } catch {
      /* visitor tracking is optional */
    }
  }

  jitter(value, amount) {
    return value + (Math.random() - 0.5) * amount;
  }

  spawnRipples(cx, cy, container) {
    container.replaceChildren();
    for (let i = 0; i < 2; i++) {
      const ring = document.createElement('div');
      ring.className = 'lock-fx-ripple';
      ring.style.left = `${cx}px`;
      ring.style.top = `${cy}px`;
      ring.style.animationDelay = `${i * 0.12}s`;
      container.appendChild(ring);
    }
  }

  spawnCracks(rect, container) {
    container.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'lock-crack-svg');
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    svg.style.left = `${rect.left}px`;
    svg.style.top = `${rect.top}px`;
    svg.style.width = `${rect.width}px`;
    svg.style.height = `${rect.height}px`;

    const cx = rect.width / 2 + this.jitter(0, 8);
    const cy = rect.height / 2 + this.jitter(0, 6);
    const maxLen = Math.max(rect.width, rect.height) * 0.72;
    const rays = 12;

    for (let i = 0; i < rays; i++) {
      const angle = (i / rays) * Math.PI * 2 + this.jitter(0, 0.2);
      const len = maxLen * (0.55 + Math.random() * 0.45);
      const cp = len * (0.35 + Math.random() * 0.2);
      const mx = cx + Math.cos(angle) * cp + this.jitter(0, 10);
      const my = cy + Math.sin(angle) * cp + this.jitter(0, 10);
      const ex = cx + Math.cos(angle + this.jitter(0, 0.08)) * len;
      const ey = cy + Math.sin(angle + this.jitter(0, 0.08)) * len;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${cx} ${cy} Q ${mx} ${my} ${ex} ${ey}`);
      path.setAttribute('class', 'lock-crack-line');
      path.style.animationDelay = `${i * 0.022}s`;
      svg.appendChild(path);

      if (Math.random() > 0.35) {
        const branch = angle + (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.45);
        const bLen = len * (0.3 + Math.random() * 0.25);
        const bx = mx + Math.cos(branch) * bLen;
        const by = my + Math.sin(branch) * bLen;
        const branchPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        branchPath.setAttribute('d', `M ${mx} ${my} L ${bx} ${by}`);
        branchPath.setAttribute('class', 'lock-crack-line lock-crack-line--branch');
        branchPath.style.animationDelay = `${i * 0.022 + 0.08}s`;
        svg.appendChild(branchPath);
      }
    }

    container.appendChild(svg);
  }

  spawnGlassBreak(rect, container) {
    container.replaceChildren();
    const cols = 7;
    const rows = 5;
    const cellW = rect.width / cols;
    const cellH = rect.height / rows;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = rect.left + c * cellW + this.jitter(0, 2);
        const y = rect.top + r * cellH + this.jitter(0, 2);
        const w = cellW + 1.5;
        const h = cellH + 1.5;
        const sx = x + w / 2;
        const sy = y + h / 2;

        let dx = sx - cx;
        let dy = sy - cy;
        const dist = Math.hypot(dx, dy) || 1;
        dx /= dist;
        dy /= dist;

        const force = 55 + Math.random() * 95 + dist * 0.12;
        const vx = dx * force + this.jitter(0, 18);
        const vy = dy * force * 0.5 - (25 + Math.random() * 35);
        const gravity = 100 + Math.random() * 90;
        const spin = (Math.random() > 0.5 ? 1 : -1) * (60 + Math.random() * 180);
        const delay = Math.min(dist * 0.55, 60) + Math.random() * 35;

        const shard = document.createElement('div');
        shard.className = 'glass-pane-shard';
        if ((r + c) % 2 === 0) shard.classList.add('glass-pane-shard--bright');

        const clip = () => `${this.jitter(0, 6)}%`;
        shard.style.clipPath = `polygon(${clip()} ${clip()}, ${100 + this.jitter(0, 4)}% ${clip()}, ${100 + this.jitter(0, 4)}% ${100 + this.jitter(0, 4)}%, ${clip()} ${100 + this.jitter(0, 4)}%)`;
        shard.style.left = `${x}px`;
        shard.style.top = `${y}px`;
        shard.style.width = `${w}px`;
        shard.style.height = `${h}px`;
        container.appendChild(shard);

        shard.animate(
          [
            { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 1, filter: 'blur(0)' },
            {
              transform: `translate3d(${vx * 0.15}px, ${vy * 0.12}px, 0) rotate(${spin * 0.08}deg)`,
              opacity: 1,
              filter: 'blur(0)',
              offset: 0.12,
            },
            {
              transform: `translate3d(${vx * 0.55}px, ${vy * 0.4 + gravity * 0.2}px, 0) rotate(${spin * 0.45}deg)`,
              opacity: 0.75,
              filter: 'blur(0.5px)',
              offset: 0.55,
            },
            {
              transform: `translate3d(${vx}px, ${vy + gravity}px, 0) rotate(${spin}deg)`,
              opacity: 0,
              filter: 'blur(2px)',
            },
          ],
          {
            duration: 1300 + Math.random() * 350,
            delay,
            easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
            fill: 'forwards',
          }
        );
      }
    }

    for (let i = 0; i < 16; i++) {
      const size = 3 + Math.random() * 10;
      const angle = Math.random() * Math.PI * 2;
      const burst = 40 + Math.random() * 120;
      const vx = Math.cos(angle) * burst;
      const vy = Math.sin(angle) * burst * 0.6 - (15 + Math.random() * 30);
      const gravity = 80 + Math.random() * 100;

      const chip = document.createElement('div');
      chip.className = 'glass-chip';
      chip.style.left = `${cx + this.jitter(0, rect.width * 0.35)}px`;
      chip.style.top = `${cy + this.jitter(0, rect.height * 0.3)}px`;
      chip.style.width = `${size}px`;
      chip.style.height = `${size * (0.4 + Math.random() * 0.8)}px`;
      container.appendChild(chip);

      chip.animate(
        [
          { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 0.9 },
          {
            transform: `translate3d(${vx}px, ${vy + gravity}px, 0) rotate(${this.jitter(0, 360)}deg)`,
            opacity: 0,
          },
        ],
        {
          duration: 900 + Math.random() * 500,
          delay: 20 + Math.random() * 80,
          easing: 'cubic-bezier(0.25, 0.75, 0.35, 1)',
          fill: 'forwards',
        }
      );
    }
  }

  spawnSparkles(rect, container) {
    container.replaceChildren();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    for (let i = 0; i < 14; i++) {
      const spark = document.createElement('div');
      spark.className = 'lock-fx-sparkle';
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 140;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist * 0.7 + 20;
      const size = 2 + Math.random() * 3;

      spark.style.left = `${cx}px`;
      spark.style.top = `${cy}px`;
      spark.style.width = `${size}px`;
      spark.style.height = `${size}px`;

      spark.animate(
        [
          { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
          { transform: `translate3d(${tx}px, ${ty}px, 0) scale(0)`, opacity: 0 },
        ],
        {
          duration: 550 + Math.random() * 400,
          delay: Math.random() * 100,
          easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)',
          fill: 'forwards',
        }
      );

      container.appendChild(spark);
    }
  }

  clearFx(fx) {
    if (!fx) return;
    fx.querySelector('#lock-fx-ripples')?.replaceChildren();
    fx.querySelector('#lock-fx-crack')?.replaceChildren();
    fx.querySelector('#lock-fx-shards')?.replaceChildren();
    fx.querySelector('#lock-fx-sparkles')?.replaceChildren();
    fx.querySelector('#lock-fx-bloom')?.classList.remove('is-active');
    fx.querySelector('#lock-fx-flash')?.classList.remove('is-pulsing');
  }

  playUnlock(name) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.unlockInstant();
      this.notify(`Thank you ${name}! Portfolio unlocked successfully! 🎉`, 'success');
      return Promise.resolve();
    }

    const lock = document.getElementById('portfolio-lock');
    const card = document.getElementById('lock-card');
    const fx = document.getElementById('lock-fx');
    const shards = document.getElementById('lock-fx-shards');
    const flash = document.getElementById('lock-fx-flash');
    const bloom = document.getElementById('lock-fx-bloom');
    const ripples = document.getElementById('lock-fx-ripples');
    const crack = document.getElementById('lock-fx-crack');
    const sparkles = document.getElementById('lock-fx-sparkles');
    const shell = document.getElementById('site-shell');

    if (!lock || !card || !fx || !shards || !shell) {
      this.unlockInstant();
      this.notify(`Thank you ${name}! Portfolio unlocked successfully! 🎉`, 'success');
      return Promise.resolve();
    }

    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    card.style.animation = 'none';
    card.classList.remove('is-charging', 'is-impacted', 'is-breaking', 'is-shattered');
    void card.offsetWidth;
    card.classList.add('is-charging');

    return new Promise((resolve) => {
      /* Phase 1 - tension build */
      setTimeout(() => {
        card.classList.remove('is-charging');
        card.classList.add('is-impacted');

        if (bloom) bloom.classList.add('is-active');
        if (flash) {
          flash.style.left = `${cx}px`;
          flash.style.top = `${cy}px`;
          flash.classList.remove('is-pulsing');
          void flash.offsetWidth;
          flash.classList.add('is-pulsing');
        }
        if (ripples) this.spawnRipples(cx, cy, ripples);
        if (crack) this.spawnCracks(rect, crack);
        fx.classList.add('is-active');
      }, 340);

      /* Phase 2 - glass shatters into grid shards */
      setTimeout(() => {
        card.classList.add('is-breaking', 'is-shattered');
        this.spawnGlassBreak(rect, shards);
        if (sparkles) this.spawnSparkles(rect, sparkles);
        lock.classList.add('is-dissolving');
      }, 520);

      /* Phase 3 - reveal portfolio */
      setTimeout(() => {
        shell.style.display = 'block';
        shell.classList.add('is-revealing');
        document.dispatchEvent(new CustomEvent('portfolio-unlocked'));
      }, 720);

      setTimeout(() => {
        document.body.classList.remove('portfolio-is-locked');
        lock.style.display = 'none';
        lock.classList.remove('is-dissolving');
        card.classList.remove('is-breaking', 'is-impacted', 'is-charging', 'is-shattered');
        card.style.animation = '';
        fx.classList.remove('is-active');
        this.clearFx(fx);
        shell.classList.remove('is-revealing');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.notify(`Thank you ${name}! Portfolio unlocked successfully! 🎉`, 'success');
        resolve();
      }, 2500);
    });
  }

  unlockInstant() {
    document.body.classList.remove('portfolio-is-locked');
    const lock = document.getElementById('portfolio-lock');
    const shell = document.getElementById('site-shell');
    if (lock) lock.style.display = 'none';
    if (shell) shell.style.display = 'block';
    document.dispatchEvent(new CustomEvent('portfolio-unlocked'));
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  notify(message, type) {
    document.querySelector('.lock-notification')?.remove();
    const el = document.createElement('div');
    el.className = `lock-notification lock-notification--${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    setTimeout(() => {
      el.classList.remove('is-visible');
      setTimeout(() => el.remove(), 400);
    }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => new PortfolioLock());

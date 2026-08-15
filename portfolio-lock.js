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
  }

  async handleSubmit(e) {
    const form = e.currentTarget;
    const nameInput = document.getElementById('visitor-name');
    const name = nameInput?.value.trim() || '';
    if (!name) {
      this.notify('Please enter your name.', 'error');
      nameInput?.focus();
      return;
    }

    const btn = form.querySelector('.unlock-btn');
    const btnText = btn?.querySelector('.btn-text');
    const btnLoader = btn?.querySelector('.btn-loader');
    if (!btn || !btnText || !btnLoader) return;

    btn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline';

    try {
      await this.sendVisitorData(name);
      sessionStorage.setItem(this.sessionKey, 'true');
      await this.playUnlock(name);
    } catch {
      this.notify('Something went wrong. Please try again.', 'error');
      btn.disabled = false;
      btnText.style.display = 'inline';
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
          subject: 'New Portfolio Visitor',
        }),
      });
      if (!res.ok) throw new Error('submit failed');
    } catch {
      /* visitor tracking is optional */
    }
  }

  playUnlock(name) {
    const thanks = `Thanks, ${name}. It's open.`;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.unlockInstant();
      this.notify(thanks, 'success');
      return Promise.resolve();
    }

    const lock = document.getElementById('portfolio-lock');
    const card = document.getElementById('lock-card');
    const shell = document.getElementById('site-shell');

    if (!lock || !card || !shell) {
      this.unlockInstant();
      this.notify(thanks, 'success');
      return Promise.resolve();
    }

    lock.classList.add('is-opening');
    card.classList.add('is-opening');

    return new Promise((resolve) => {
      setTimeout(() => {
        shell.style.display = 'block';
        shell.classList.add('is-revealing');
        document.dispatchEvent(new CustomEvent('portfolio-unlocked'));
      }, 180);

      setTimeout(() => {
        document.body.classList.remove('portfolio-is-locked');
        lock.style.display = 'none';
        lock.classList.remove('is-opening');
        card.classList.remove('is-opening');
        shell.classList.remove('is-revealing');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.notify(thanks, 'success');
        resolve();
      }, 920);
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
    }, 2800);
  }
}

document.addEventListener('DOMContentLoaded', () => new PortfolioLock());

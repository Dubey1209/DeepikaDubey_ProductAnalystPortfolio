(function () {
  const PUBLIC_KEY = 'tKGsj-T6YjYbG5zcA';
  const SERVICE_ID = 'service_7lkipnf';
  const TEMPLATE_ID = 'template_z1gyvmn';
  const EMAILJS_SRC = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';

  let emailJsReady = null;
  let emailJsInited = false;

  function loadEmailJs() {
    if (typeof emailjs !== 'undefined') {
      return Promise.resolve();
    }
    if (emailJsReady) return emailJsReady;

    emailJsReady = new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = EMAILJS_SRC;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    return emailJsReady;
  }

  function initContactForm() {
    const form = document.getElementById('contactForm');
    const formStatus = document.getElementById('form-status');
    if (!form || !formStatus) return;

    form.addEventListener('focusin', function () {
      loadEmailJs().catch(function () {});
    }, { once: true });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (!submitBtn) return;

      const originalBtnText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Sending...';

      const templateParams = {
        from_name: document.getElementById('name').value,
        from_email: document.getElementById('email').value,
        company: document.getElementById('company').value || 'Not provided',
        message: document.getElementById('message').value,
        reply_to: document.getElementById('email').value,
      };

      loadEmailJs()
        .then(function () {
          if (!emailJsInited) {
            emailjs.init({ publicKey: PUBLIC_KEY });
            emailJsInited = true;
          }
          return emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams);
        })
        .then(function () {
          formStatus.innerHTML =
            '<div class="success-message">Message sent. I will get back to you soon.</div>';
          form.reset();
        })
        .catch(function () {
          formStatus.innerHTML =
            '<div class="error-message">Oops! Something went wrong. Please try again or email me directly at <a href="mailto:dubeydeepika1209@gmail.com">dubeydeepika1209@gmail.com</a></div>';
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnText;
          formStatus.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initContactForm);
  } else {
    initContactForm();
  }
})();

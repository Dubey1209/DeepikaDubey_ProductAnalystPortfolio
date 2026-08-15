// Mobile Navigation
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const drawerOverlay = document.querySelector('.drawer-overlay');
const drawerCloseBtn = document.querySelector('.drawer-close-btn');
const dropdownToggles = document.querySelectorAll('.dropdown > a');
let isMenuOpen = false;

function toggleMenu() {
  isMenuOpen = !isMenuOpen;
  navLinks.classList.toggle('open', isMenuOpen);
  document.body.style.overflow = isMenuOpen ? 'hidden' : '';

  if (drawerOverlay) {
    drawerOverlay.classList.toggle('visible', isMenuOpen);
  }

  if (menuToggle) {
    menuToggle.setAttribute('aria-expanded', isMenuOpen);
  }

  if (!isMenuOpen) {
    document.querySelectorAll('.dropdown-content').forEach((dropdown) => {
      dropdown.classList.remove('show');
    });
    dropdownToggles.forEach((toggle) => {
      toggle.setAttribute('aria-expanded', 'false');
    });
  }
}

function closeMenu() {
  isMenuOpen = false;
  if (!navLinks) return;
  navLinks.classList.remove('open');
  document.body.style.overflow = '';

  if (drawerOverlay) {
    drawerOverlay.classList.remove('visible');
  }

  if (menuToggle) {
    menuToggle.setAttribute('aria-expanded', 'false');
  }
}

function toggleDropdown(e) {
  if (window.innerWidth <= 800) {
    e.preventDefault();
    const dropdown = this.nextElementSibling;
    const isOpen = !dropdown.classList.contains('show');

    document.querySelectorAll('.dropdown-content').forEach((item) => {
      item.classList.remove('show');
    });

    if (isOpen) {
      dropdown.classList.add('show');
      this.setAttribute('aria-expanded', 'true');

      const handleClickOutside = (event) => {
        if (!event.target.closest('.dropdown')) {
          dropdown.classList.remove('show');
          this.setAttribute('aria-expanded', 'false');
          document.removeEventListener('click', handleClickOutside);
        }
      };

      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
    } else {
      this.setAttribute('aria-expanded', 'false');
    }
  }
}

if (menuToggle && navLinks) {
  menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
    });
  }

  if (drawerCloseBtn) {
    drawerCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
    });
  }

  navLinks.querySelectorAll('a:not(.dropdown > a)').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 800) {
        closeMenu();
      }
    });
  });

  dropdownToggles.forEach((toggle) => {
    toggle.addEventListener('click', toggleDropdown);
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleDropdown.call(toggle, e);
      } else if (e.key === 'Escape') {
        const dropdown = toggle.nextElementSibling;
        dropdown.classList.remove('show');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isMenuOpen) {
    closeMenu();
  }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (window.innerWidth > 800) {
      closeMenu();
      document.querySelectorAll('.dropdown-content').forEach((dropdown) => {
        dropdown.classList.remove('show');
      });
    }
  }, 250);
});

document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('page-loaded');

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (!targetId || targetId === '#' || targetId.length <= 1) return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
});

const experienceOrder = ['zyra', 'tnumber', 'thatha', 'sdc-si'];

const experienceData = {
  zyra: {
    title: 'Junior Technical Product Manager',
    shortTitle: 'Technical PM',
    company: 'Zyra',
    companyFull: 'Zyra',
    type: 'Technology & Software',
    period: 'Jun 2026 - Present',
    periodShort: 'Now',
    emoji: '⚡',
    accent: '#6366f1',
    highlight: 'Shipping features end-to-end',
    tags: ['Technical PM', 'Rapid Prototyping', 'Team Lead'],
    summary:
      'Currently leading the software team and working closely with PMs and engineers to ship new features - making product decisions with the CEO, writing code when needed, and building rapid prototypes to move fast.',
    description: `
      <ul>
        <li><strong>Lead software delivery</strong> across the team, keeping builds focused, fast, and aligned with product priorities.</li>
        <li><strong>Collaborate daily with PMs and engineers</strong> to turn product goals into clear specs, unblock development, and ship new features from idea to release.</li>
        <li><strong>Work with the CEO on product decisions</strong>, bringing user context, technical feasibility, and trade-off analysis to shape what we build next.</li>
        <li><strong>Write code when required</strong> - jump into the codebase to fix blockers, validate implementations, and keep momentum high on critical releases.</li>
        <li><strong>Build rapid prototypes</strong> to test ideas early, gather feedback faster, and de-risk feature bets before full engineering investment.</li>
        <li><strong>Drive end-to-end feature shipping</strong>, coordinating discovery, scoping, development, and launch so new capabilities reach users reliably and on time.</li>
      </ul>
    `,
  },
  tnumber: {
    title: 'Associate Product Management Intern',
    shortTitle: 'APM Intern',
    company: 'Tnumber',
    companyFull: 'Tnumber',
    type: 'Communication Platform',
    period: 'Jan 2026 - Apr 2026',
    periodShort: '2026',
    emoji: '📱',
    accent: '#2a7ae2',
    highlight: '30% fewer support tickets',
    tags: ['Product Execution', 'JIRA', 'QA'],
    summary:
      'Led end-to-end execution of product features across web dashboards and mobile apps, coordinating with engineers to deliver usability improvements.',
    description: `
      <ul>
        <li><strong>Product Led end-to-end execution</strong> of product features across web dashboards and mobile applications, coordinating with engineers to deliver usability improvements that resulted in 30% reduction in support tickets.</li>
        <li><strong>Restructured product backlog</strong> by detailing Jira tickets with subtasks and prioritizing high-impact bugs, streamlining sprint execution and achieving 35% faster bug resolution.</li>
        <li><strong>Implemented onboarding improvements</strong> by simplifying UI flows based on user feedback, collaborating with design team to improve product intuitiveness, leading to 15% improvement in onboarding completion rate.</li>
        <li><strong>Analyzed product analytics</strong> and user feedback to track adoption and usage trends, identifying areas for feature iteration and informing product decisions that drove 15% increase in feature adoption.</li>
        <li><strong>Conducted product QA</strong> across platforms, identified 60+ bugs, and raised GitHub issues, collaborating with engineering teams to ensure stable feature releases.</li>
      </ul>
    `,
  },
  thatha: {
    title: 'Product Lead Intern',
    shortTitle: 'Product Lead',
    company: 'THATha',
    companyFull: 'THATha Business Development',
    type: 'Early-stage SaaS Startup',
    period: 'Jul 2025 - Nov 2025',
    periodShort: '2025',
    emoji: '🚀',
    accent: '#a259ff',
    highlight: '20% user engagement lift',
    tags: ['Roadmapping', 'Usability Testing', 'SaaS'],
    location: 'Bangalore, India',
    summary:
      'Owned roadmap planning and backlog prioritization for a multi-tenant SaaS product, aligning delivery with customer success goals.',
    description: `
      <ul>
        <li><strong>Owned roadmap planning</strong> and backlog prioritization for a multi-tenant SaaS product, aligning delivery with customer success goals, resulting in 20% increase in user engagement.</li>
        <li><strong>Translated stakeholder requirements</strong> into technical specifications, streamlining website flow and clarifying feature sections to accelerate engineering execution by 15%.</li>
        <li><strong>Led usability testing</strong> and funnel analysis with 15-20 participants to identify friction points in user journey and simplify the interface.</li>
        <li><strong>Refined website flow</strong> and feature presentation, improving user experience and enhancing overall engagement from new users, leading to a 17% increase in conversion rates.</li>
        <li><strong>Collaborated with design and development teams</strong> to implement 10 website features for an early-stage SaaS product, iterating quickly based on user feedback.</li>
        <li><strong>Conducted lightweight usability testing</strong>, guiding users through the product and observing navigation of key flows to identify usability issues.</li>
        <li><strong>Prioritized features</strong> to improve usability and customer onboarding for pilot customers, shaping the product experience based on early user feedback.</li>
      </ul>
    `,
  },
  'sdc-si': {
    title: 'Android Developer',
    shortTitle: 'Android Dev',
    company: 'SDC SI',
    companyFull: 'Software Incubator (SDC SI)',
    type: 'Mobile Product Development',
    period: 'Aug 2023 - Nov 2023',
    periodShort: '2023',
    emoji: '🤖',
    accent: '#43e97b',
    highlight: '10% faster app response',
    tags: ['Kotlin', 'REST APIs', 'Android UI'],
    location: 'Ghaziabad, India',
    summary:
      'Developed Android UI screens using XML layouts and integrated backend REST APIs for smooth data retrieval and interaction.',
    description: `
      <ul>
        <li><strong>Developed Android UI screens</strong> using XML layouts, integrating backend REST APIs to ensure smooth data retrieval and interaction, leading to 10% improvement in app responsiveness.</li>
        <li><strong>Optimized onboarding flow</strong> and feature accessibility based on product usage data, improving API integrations and UI responsiveness, resulting in a 10% increase in feature adoption and Day-1 retention.</li>
        <li><strong>Addressed delays in data fetching</strong> from backend APIs by optimizing network calls and data rendering within the UI, achieving 15% reduction in data loading times.</li>
      </ul>
    `,
  },
};

function openExperienceModal(experienceId) {
  const modal = document.getElementById('experienceModal');
  const modalBody = document.getElementById('modal-body');
  const data = experienceData[experienceId];

  if (!modal || !modalBody || !data) return;

  modalBody.innerHTML = `
    <h3>${data.title}</h3>
    <div class="company-info">
      <span class="company-name">${data.companyFull || data.company}</span>
      <span class="company-type">${data.type}</span>
      <span class="experience-period">${data.period}</span>
      ${data.location ? `<span class="experience-period">${data.location}</span>` : ''}
    </div>
    <div class="full-description">${data.description}</div>
  `;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeExperienceModal() {
  const modal = document.getElementById('experienceModal');
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeExperienceModal();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const experienceModal = document.getElementById('experienceModal');
  if (experienceModal) {
    experienceModal.addEventListener('click', (e) => {
      if (e.target === experienceModal) {
        closeExperienceModal();
      }
    });
  }

  initExperienceShowcase();
});

function initExperienceShowcase() {
  const rail = document.getElementById('experienceRail');
  const spotlight = document.getElementById('experienceSpotlight');
  const progressFill = document.getElementById('experienceProgressFill');
  const prevBtn = document.getElementById('expPrev');
  const nextBtn = document.getElementById('expNext');

  if (!rail || !spotlight || !experienceOrder.length) return;

  let activeId = experienceOrder[0];

  function updateProgress(index) {
    if (!progressFill) return;
    const pct = experienceOrder.length <= 1 ? 100 : (index / (experienceOrder.length - 1)) * 100;
    progressFill.style.width = pct + '%';
  }

  function renderRail() {
    rail.innerHTML = experienceOrder
      .map(function (id) {
        var d = experienceData[id];
        var isActive = id === activeId;
        return (
          '<button type="button" class="exp-pill' +
          (isActive ? ' is-active' : '') +
          '" role="tab" aria-selected="' +
          isActive +
          '" data-exp="' +
          id +
          '" style="--exp-accent:' +
          d.accent +
          '">' +
          '<span class="exp-pill-emoji" aria-hidden="true">' +
          d.emoji +
          '</span>' +
          '<span class="exp-pill-body">' +
          '<span class="exp-pill-company">' +
          d.company +
          '</span>' +
          '<span class="exp-pill-role">' +
          d.shortTitle +
          '</span>' +
          '</span>' +
          '<span class="exp-pill-year">' +
          d.periodShort +
          '</span>' +
          '</button>'
        );
      })
      .join('');

    rail.querySelectorAll('.exp-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectExperience(btn.dataset.exp);
      });
    });
  }

  function renderSpotlight() {
    var d = experienceData[activeId];
    var idx = experienceOrder.indexOf(activeId);
    var tagsHtml = (d.tags || [])
      .map(function (tag) {
        return '<span class="exp-tag">' + tag + '</span>';
      })
      .join('');

    spotlight.style.setProperty('--exp-accent', d.accent);
    spotlight.classList.add('is-switching');
    spotlight.innerHTML =
      '<div class="exp-spotlight-inner">' +
      '<div class="exp-spotlight-badge" aria-hidden="true">' +
      d.emoji +
      '</div>' +
      '<div class="exp-spotlight-main">' +
      '<div class="exp-spotlight-meta">' +
      '<span class="exp-spotlight-period">' +
      d.period +
      '</span>' +
      '<span class="exp-spotlight-highlight">' +
      d.highlight +
      '</span>' +
      '</div>' +
      '<h3 class="exp-spotlight-title">' +
      d.title +
      '</h3>' +
      '<div class="exp-spotlight-company">' +
      '<span class="company-name">' +
      (d.companyFull || d.company) +
      '</span>' +
      '<span class="company-type">' +
      d.type +
      '</span>' +
      (d.location ? '<span class="exp-spotlight-location">' + d.location + '</span>' : '') +
      '</div>' +
      '<p class="exp-spotlight-summary">' +
      d.summary +
      '</p>' +
      (tagsHtml ? '<div class="exp-spotlight-tags">' + tagsHtml + '</div>' : '') +
      '<div class="exp-spotlight-actions">' +
      '<button type="button" class="experience-read-more exp-read-full" data-exp="' +
      activeId +
      '">Full Story <span>→</span></button>' +
      '<div class="exp-spotlight-nav">' +
      '<button type="button" class="exp-step-nav" data-dir="prev"' +
      (idx === 0 ? ' disabled' : '') +
      '>← Prev</button>' +
      '<span class="exp-step-count">' +
      (idx + 1) +
      ' / ' +
      experienceOrder.length +
      '</span>' +
      '<button type="button" class="exp-step-nav" data-dir="next"' +
      (idx === experienceOrder.length - 1 ? ' disabled' : '') +
      '>Next →</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    requestAnimationFrame(function () {
      spotlight.classList.remove('is-switching');
    });

    spotlight.querySelector('.exp-read-full').addEventListener('click', function () {
      openExperienceModal(activeId);
    });

    spotlight.querySelectorAll('.exp-step-nav').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        var dir = btn.dataset.dir;
        var nextIdx = dir === 'prev' ? idx - 1 : idx + 1;
        selectExperience(experienceOrder[nextIdx]);
      });
    });

    updateProgress(idx);

    var activePill = rail.querySelector('[data-exp="' + activeId + '"]');
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  function selectExperience(id) {
    if (!experienceData[id] || id === activeId) return;
    activeId = id;
    renderRail();
    renderSpotlight();
  }

  function stepExperience(dir) {
    var idx = experienceOrder.indexOf(activeId);
    var nextIdx = dir === 'prev' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= experienceOrder.length) return;
    selectExperience(experienceOrder[nextIdx]);
  }

  if (prevBtn) prevBtn.addEventListener('click', function () { stepExperience('prev'); });
  if (nextBtn) nextBtn.addEventListener('click', function () { stepExperience('next'); });

  renderRail();
  renderSpotlight();
}

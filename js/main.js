// Vl:Aštovka — interactions
(function () {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Sticky header state
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => {
      if (window.scrollY > 40) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Mobile menu toggle
  const menuBtn = document.querySelector('.menu-btn');
  const nav = document.querySelector('.nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menuBtn.classList.toggle('is-open', open);
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('open');
      menuBtn.classList.remove('is-open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }));
  }

  // Smooth scroll for in-page links
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    });
  });

  // Counter animation
  function animateCount(el) {
    const end = parseFloat(el.dataset.count || '0');
    const decimals = (el.dataset.decimals | 0);
    const duration = 1400;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const v = end * ease(t);
      el.textContent = decimals ? v.toFixed(decimals) : Math.round(v).toString();
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // IntersectionObserver: reveals + stats
  if ('IntersectionObserver' in window) {
    const revealIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          revealIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(el => revealIO.observe(el));

    const statIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (!prefersReduced) animateCount(entry.target);
          else entry.target.textContent = entry.target.dataset.count;
          statIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('.stat-num[data-count]').forEach(el => statIO.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
    document.querySelectorAll('.stat-num[data-count]').forEach(el => { el.textContent = el.dataset.count; });
  }

  // Year in footer
  const yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ===== SCROLLSPY =====
  // Watch which section is in view and highlight matching nav link.
  const navLinks = Array.from(document.querySelectorAll('.nav a[href^="#"]'));
  const sections = navLinks
    .map(a => ({link: a, id: a.getAttribute('href').slice(1)}))
    .filter(s => s.id.length > 0)
    .map(s => ({link: s.link, el: document.getElementById(s.id)}))
    .filter(s => s.el);

  if (sections.length && 'IntersectionObserver' in window) {
    // Track visibility ratios; pick the section with the highest ratio.
    const ratios = new Map();
    const spyIO = new IntersectionObserver((entries) => {
      entries.forEach(e => ratios.set(e.target, e.intersectionRatio));
      let bestEl = null;
      let bestRatio = 0;
      ratios.forEach((r, el) => {
        if (r > bestRatio) { bestRatio = r; bestEl = el; }
      });
      navLinks.forEach(a => a.classList.remove('is-active'));
      if (bestEl && bestRatio > 0) {
        const match = sections.find(s => s.el === bestEl);
        if (match) match.link.classList.add('is-active');
      }
    }, {
      // Fire at several thresholds so we pick the most-visible section.
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      rootMargin: '-80px 0px -40% 0px'
    });
    sections.forEach(s => spyIO.observe(s.el));
  }
})();

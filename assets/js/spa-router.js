/**
 * Harmony Harikesh - High-Performance Client-Side SPA Router
 * Provides instant, zero-reload page navigation, persistent assets in memory,
 * smooth cross-fade transitions, and back/forward browser history support.
 */

(function () {
  'use strict';

  // Mark session as preloaded so loading screen only ever appears on initial cold visit
  if (!sessionStorage.getItem('harmony_preloaded')) {
    sessionStorage.setItem('harmony_preloaded', 'true');
  }

  const pageCache = new Map();
  const internalPages = ['index.html', 'ascent.html', 'amenities.html', 'gallery.html', ''];

  // Helper to normalize path
  function normalizeUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      let pathname = parsed.pathname;
      if (pathname.endsWith('/') || pathname === '') {
        pathname += 'index.html';
      }
      return {
        origin: parsed.origin,
        pathname: pathname.split('/').pop() || 'index.html',
        fullPath: parsed.pathname + parsed.search,
        hash: parsed.hash,
        href: parsed.href
      };
    } catch (e) {
      return null;
    }
  }

  // Pre-fetch all internal pages in background after idle for 0ms navigation
  function prefetchPages() {
    const pagesToCache = ['index.html', 'ascent.html', 'amenities.html', 'gallery.html'];
    pagesToCache.forEach(page => {
      if (!pageCache.has(page)) {
        fetch(page, { credentials: 'same-origin' })
          .then(res => res.text())
          .then(html => {
            pageCache.set(page, html);
          })
          .catch(() => {});
      }
    });
  }

  if (window.requestIdleCallback) {
    window.requestIdleCallback(prefetchPages);
  } else {
    setTimeout(prefetchPages, 800);
  }

  // Intercept click on links
  document.addEventListener('click', function (e) {
    const anchor = e.target.closest('a');
    if (!anchor) return;

    // Ignore downloads, external links, whatsapp, phone, mailto, etc.
    const href = anchor.getAttribute('href');
    if (!href) return;
    if (href.startsWith('tel:') || href.startsWith('mailto:') || href.startsWith('javascript:') || anchor.target === '_blank') {
      return;
    }

    const targetUrl = normalizeUrl(href);
    if (!targetUrl || targetUrl.origin !== window.location.origin) {
      return;
    }

    const currentUrl = normalizeUrl(window.location.href);

    // Case 1: Same page anchor scroll (e.g. #about or index.html#about when already on index.html)
    if (targetUrl.pathname === currentUrl.pathname && targetUrl.hash) {
      e.preventDefault();
      closeMobileMenu();
      const targetElement = document.querySelector(targetUrl.hash);
      if (targetElement) {
        scrollToTarget(targetElement);
        history.pushState(null, '', targetUrl.hash);
      }
      return;
    }

    // Case 2: Same page link to top without hash
    if (targetUrl.pathname === currentUrl.pathname && !targetUrl.hash) {
      e.preventDefault();
      closeMobileMenu();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Case 3: Navigating to different internal page
    e.preventDefault();
    closeMobileMenu();
    navigateSPA(href, true);
  });

  // Handle browser Back & Forward buttons
  window.addEventListener('popstate', function () {
    navigateSPA(window.location.href, false);
  });

  // Core SPA Navigation function
  async function navigateSPA(targetHref, pushToHistory = true) {
    const targetUrl = normalizeUrl(targetHref);
    if (!targetUrl) return;

    const currentUrl = normalizeUrl(window.location.href);

    // If navigating to the same page with an anchor hash
    if (targetUrl.pathname === currentUrl.pathname && targetUrl.hash) {
      const el = document.querySelector(targetUrl.hash);
      if (el) scrollToTarget(el);
      if (pushToHistory) history.pushState(null, '', targetHref);
      return;
    }

    const contentContainer = document.getElementById('spa-content');
    if (!contentContainer) {
      // Fallback if container doesn't exist
      window.location.href = targetHref;
      return;
    }

    // Fast smooth 120ms fade out transition
    if (window.gsap) {
      await gsap.to(contentContainer, { opacity: 0, y: -8, duration: 0.12, ease: 'power2.in' });
    } else {
      contentContainer.style.opacity = '0';
    }

    try {
      let html = pageCache.get(targetUrl.pathname);
      if (!html) {
        const response = await fetch(targetUrl.pathname, { credentials: 'same-origin' });
        html = await response.text();
        pageCache.set(targetUrl.pathname, html);
      }

      // Parse incoming HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const newContent = doc.getElementById('spa-content');

      if (!newContent) {
        window.location.href = targetHref;
        return;
      }

      // Update document title
      if (doc.title) {
        document.title = doc.title;
      }

      // Swap main content seamlessly
      contentContainer.innerHTML = newContent.innerHTML;

      // Update active navigation state in navbar
      updateActiveNavLinks(targetUrl.pathname);

      // Update History
      if (pushToHistory) {
        history.pushState({ path: targetHref }, doc.title, targetHref);
      }

      // Re-initialize all Lucide icons
      if (window.lucide) {
        window.lucide.createIcons();
      }

      // If user linked to a section hash, scroll to it, otherwise scroll to top
      if (targetUrl.hash) {
        setTimeout(() => {
          const el = document.querySelector(targetUrl.hash);
          if (el) {
            scrollToTarget(el);
          } else {
            window.scrollTo({ top: 0, behavior: 'instant' });
          }
        }, 30);
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }

      // Re-hydrate page interactive components
      rehydratePage(targetUrl.pathname);

      // Fast smooth 180ms fade in transition
      if (window.gsap) {
        gsap.fromTo(contentContainer, 
          { opacity: 0, y: 10 }, 
          { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform,opacity' }
        );
      } else {
        contentContainer.style.opacity = '1';
      }

    } catch (err) {
      console.error('SPA navigation error, falling back to full navigation:', err);
      window.location.href = targetHref;
    }
  }

  // Smooth scroll with navbar clearance offset
  function scrollToTarget(el) {
    const headerOffset = 85;
    const elementPosition = el.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
  }

  // Close mobile drawer if open
  function closeMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    const btn = document.getElementById('mobile-menu-btn');
    if (menu && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
      if (btn) {
        btn.innerHTML = '<i data-lucide="menu" class="w-4 h-4"></i>';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  // Update active style on navbar links
  function updateActiveNavLinks(currentPath) {
    const navLinks = document.querySelectorAll('#nav-links a, #mobile-menu a');
    navLinks.forEach(link => {
      const href = link.getAttribute('href') || '';
      const norm = normalizeUrl(href);
      if (!norm) return;

      if (norm.pathname === currentPath && !norm.hash) {
        link.classList.add('text-luxury-gold', 'font-bold');
        link.classList.remove('text-slate-300');
      } else {
        link.classList.remove('text-luxury-gold', 'font-bold');
        link.classList.add('text-slate-300');
      }
    });
  }

  // Re-hydrate scripts and interactive widgets depending on destination page
  function rehydratePage(pageName) {
    // If homepage
    if (pageName === 'index.html' || pageName === '') {
      if (typeof window.initThreeHero === 'function') {
        window.initThreeHero();
      }
      if (typeof window.initHeroAnimations === 'function') {
        window.initHeroAnimations();
      }
      if (typeof window.startLuxuryTypewriter === 'function') {
        window.startLuxuryTypewriter();
      }
      if (typeof window.initMagneticButtons === 'function') {
        window.initMagneticButtons();
      }
    }

    // Refresh GSAP ScrollTrigger calculations
    if (window.ScrollTrigger) {
      setTimeout(() => {
        ScrollTrigger.refresh();
      }, 50);
    }
  }

  // Expose global navigate function for programmatic SPA jumps
  window.harmonyNavigate = navigateSPA;

})();

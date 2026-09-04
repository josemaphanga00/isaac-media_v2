/* =====================================================================
   ISAAC MEDIA v2 — script.js
   Integrated from two source builds:
     - Content, form endpoints, FAQ, pricing → production (Bootstrap) build
     - Architecture (single modal, delegation, IO-paused animation) → glass build
   Bootstrap JS is NOT loaded. Everything here is dependency-free.
   ===================================================================== */

(() => {
  'use strict';

  /* =========================================================
     UTILITIES
  ========================================================= */
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // rAF-batched scroll — collapses many scroll events into one per frame
  function onScroll(callback) {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          callback();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  function debounce(fn, wait = 150) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // Run non-critical setup when the browser is idle, with a safe fallback
  const runWhenIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

  /* =========================================================
     NAVBAR — shrink on scroll + active-link highlight via IO
     (replaces Bootstrap ScrollSpy — no scroll-position math needed)
  ========================================================= */
  function initNavbar() {
    const navbar = document.getElementById('mainNav');
    if (!navbar) return;

    onScroll(() => {
      navbar.classList.toggle('navbar-shrink', window.scrollY > 8);
    });

    const navLinks = navbar.querySelectorAll('a[href^="#"]');
    const sections = [...navLinks]
      .map((link) => document.querySelector(link.getAttribute('href')))
      .filter(Boolean);

    if (!sections.length || !('IntersectionObserver' in window)) return;

    const linkFor = (id) => navbar.querySelector(`a[href="#${id}"]`);

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const link = linkFor(entry.target.id);
          if (!link) return;
          if (entry.isIntersecting) {
            navLinks.forEach((l) => l.classList.remove('active'));
            link.classList.add('active');
          }
        });
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );

    sections.forEach((section) => io.observe(section));
  }

  /* =========================================================
     MOBILE MENU (island navbar hamburger)
  ========================================================= */
  function initMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobile-menu');
    if (!hamburger || !mobileMenu) return;

    const setOpen = (open) => {
      mobileMenu.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', String(open));
      mobileMenu.setAttribute('aria-hidden', String(!open));
      document.body.style.overflow = open ? 'hidden' : '';
    };

    hamburger.addEventListener('click', () => {
      setOpen(!mobileMenu.classList.contains('open'));
    });

    // Delegated — closes on any link/button tap inside, no per-item listeners
    mobileMenu.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) setOpen(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) setOpen(false);
    });
  }

  /* =========================================================
     HERO BACKGROUND SLIDESHOW — progressive load, IO/visibility paused
  ========================================================= */
  function initHeroSlideshow() {
    const container = document.getElementById('bg-slideshow');
    if (!container) return;

    const images = [
      'assets/img/hero-section/hero_sabelo.webp',
      'assets/img/hero-section/rings.webp',
      'assets/img/hero-section/wed.webp',
      'assets/img/hero-section/cater.webp',
    ];

    const slides = images.map((src, i) => {
      const div = document.createElement('div');
      div.className = 'bg-slide';
      // Only the first two are eagerly set — the rest load just-in-time
      if (i < 2) div.style.backgroundImage = `url('${src}')`;
      container.appendChild(div);
      return div;
    });
    slides[0].classList.add('active');

    if (prefersReducedMotion) return; // static first frame only, no timers at all

    let current = 0;
    let timer = null;
    let visible = !document.hidden;

    const load = (i) => {
      if (!slides[i].style.backgroundImage) {
        slides[i].style.backgroundImage = `url('${images[i]}')`;
      }
    };

    const goTo = (i) => {
      load(i);
      slides[current].classList.remove('active');
      slides[i].classList.add('active');
      current = i;
      load((current + 1) % images.length); // preload next
    };

    const start = () => {
      stop();
      timer = setInterval(() => {
        if (!visible) return;
        goTo((current + 1) % images.length);
      }, 5000);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    document.addEventListener('visibilitychange', () => {
      visible = !document.hidden;
      visible ? start() : stop();
    });

    start();
  }

  /* =========================================================
     EVENT MINI SLIDESHOWS — paused when off-screen (IO) and hidden (VA)
  ========================================================= */
  function initEventSlideshows() {
    const groups = document.querySelectorAll('[data-slideshow]');
    if (!groups.length) return;

    groups.forEach((container) => {
      const slides = container.querySelectorAll('.event-slide');
      if (slides.length < 2) return;

      let current = 0;
      let timer = null;

      const goTo = (i) => {
        slides[current].classList.remove('active');
        slides[i].classList.add('active');
        current = i;
      };
      const start = () => {
        if (prefersReducedMotion || timer) return;
        timer = setInterval(() => goTo((current + 1) % slides.length), 4000);
      };
      const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(
          (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
          { threshold: 0.1 }
        ).observe(container);
      } else {
        start();
      }

      document.addEventListener('visibilitychange', () => {
        document.hidden ? stop() : start();
      });
    });
  }

  /* =========================================================
     PORTFOLIO TOGGLE — reveals the rest of the gallery in place.
     No duplicate markup, no separate overlay system — the lightbox
     already handles any .masonry img via delegation.
  ========================================================= */
  function initPortfolioToggle() {
    const btn = document.getElementById('portfolio-toggle');
    const more = document.querySelectorAll('.masonry-more');
    if (!btn || !more.length) return;

    let expanded = false;
    btn.addEventListener('click', () => {
      expanded = !expanded;
      more.forEach((item) => { item.hidden = !expanded; });
      btn.textContent = expanded ? 'Show Less' : 'View Portfolio';
    });
  }

  /* =========================================================
     MODAL SYSTEM — single reusable overlay, real content, delegated triggers
  ========================================================= */
  const modalTemplates = {
    booking: () => `
      <h2 class="text-uppercase">Book Your Wedding</h2>
      <p class="item-intro text-muted">Isaac Media</p>
      <form class="bookingform">
        <input type="text" name="fullName" placeholder="Full Name" required>
        <input type="email" name="email" placeholder="Email Address" required>
        <input type="tel" name="phone" placeholder="Phone / WhatsApp Number" required>
        <select name="weddingPackage" required>
          <option value="">Select Wedding Package</option>
          <option value="starter">Starter — R9,000</option>
          <option value="standard">Standard — R15,500</option>
          <option value="premium">Premium — R23,500</option>
        </select>
        <input type="date" name="eventDate" required>
        <input type="text" name="location" placeholder="Wedding Venue / Location">
        <textarea name="message" placeholder="Tell us about your wedding day..."></textarea>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary btn-xl text-uppercase">Submit</button>
          <button type="button" class="btn btn-outline-light btn-xl text-uppercase" data-whatsapp>
            Enquire More <i class="fab fa-whatsapp ms-1"></i>
          </button>
        </div>
      </form>
    `,
    inquiry: () => `
      <h2 class="text-uppercase">Make an Inquiry</h2>
      <p class="item-intro text-muted">Isaac Media</p>
      <form class="inquiryform">
        <input type="text" name="full_name" placeholder="Full Name" required>
        <input type="email" name="email" placeholder="Email Address" required>
        <input type="tel" name="phone" placeholder="Phone / WhatsApp Number">
        <select name="inquiry_type" required>
          <option value="">What is this about?</option>
          <option>Pricing Inquiry</option>
          <option>Availability Check</option>
          <option>General Question</option>
          <option>Custom Request</option>
        </select>
        <input type="text" name="event_type" placeholder="Event Type (Optional)">
        <input type="date" name="event_date">
        <input type="text" name="location" placeholder="Location (Optional)">
        <textarea name="message" placeholder="Your message..." required></textarea>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary btn-xl text-uppercase">Send Inquiry</button>
          <button type="button" class="btn btn-outline-light btn-xl text-uppercase" data-close>Cancel</button>
        </div>
      </form>
    `,
    about: () => `
      <h2 class="text-uppercase">About Isaac Media</h2>
      <p class="item-intro text-muted">Isaac Media</p>
      <div class="image-wrapper">
        <img class="img-fluid d-block mx-auto about-modal-img" src="assets/img/isaac-ngobeni/isaac2.webp" alt="Isaac Media" loading="lazy" decoding="async">
      </div>
      <p class="about-text">Isaac Media is a creative visual brand founded by Isaac Ngobeni, a passionate photographer and videographer dedicated to capturing life's most meaningful moments with authenticity and excellence.</p>
      <p class="about-text">With over 10 years of experience in videography, 4 years in video editing, and 4 years in professional photography, Isaac brings a unique storytelling approach shaped by his journey behind the camera.</p>
      <p class="about-text">Isaac Media specializes in wedding, lifestyle, event, and family photography, creating timeless visuals that reflect genuine emotion, connection, and detail.</p>
      <p class="about-text">Founded in August 2022, the brand was built on a long-standing passion that began at the age of 16 while serving in the church media department.</p>
      <div class="modal-btn-group">
        <button class="btn btn-primary btn-xl text-uppercase" data-close><i class="fas fa-xmark me-1"></i> Close About</button>
      </div>
    `,
    package1: () => packageTemplate({
      title: 'Starter', price: 'R9,000',
      tagline: 'Perfect for intimate moments and smaller celebrations.',
      img: 'assets/img/package-img/msiza.webp',
      items: ['9 Hours of Photography', '1 Photographer', 'Professional Editing', '300+ High-Resolution Photos', 'Digital Delivery'],
    }),
    package2: () => packageTemplate({
      title: 'Standard', price: 'R15,500',
      tagline: 'For fuller, more memorable experience.',
      img: 'assets/img/package-img/is3.webp',
      items: ['Complimentary Engagement Shoot', '9 Hours of Photography', '1 Photographer', '300+ High-Resolution Photos', 'Digital Delivery', '40-Page Photobook'],
    }),
    package3: () => packageTemplate({
      title: 'Premium', price: 'R23,500',
      tagline: 'For clients who want everything captured and preserved beautifully.',
      img: 'assets/img/package-img/sandrasabelo.webp',
      items: ['Complimentary Engagement Shoot', '1 Hour Bridal Shower Coverage', '9 Hours of Photography', '1 Photographer', 'Professional Editing', '300+ High-Resolution Photos', '5-Minute Highlight Video', 'Digital Delivery + Online Gallery', '40-Page Photobook'],
    }),
  };

  function packageTemplate({ title, price, tagline, img, items }) {
    return `
      <h2 class="text-uppercase">${title}</h2>
      <p class="item-intro text-muted">Isaac Media</p>
      <div class="image-wrapper">
        <img class="img-fluid d-block mx-auto" src="${img}" alt="${title} package" loading="lazy" decoding="async" width="400" height="400">
      </div>
      <h5>${tagline}</h5>
      <ul class="list-inline">${items.map((i) => `<li>${i}</li>`).join('')}</ul>
      <h5>${price}</h5>
      <div class="modal-btn-group">
        <button class="btn btn-book btn-xl text-uppercase" data-open-modal="booking"><i class="fas fa-calendar me-1"></i> Book Session</button>
        <button class="btn btn-primary btn-xl text-uppercase" data-whatsapp>Enquire More <i class="fab fa-whatsapp ms-1"></i></button>
      </div>
    `;
  }

  function initModals() {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');
    if (!overlay || !content || !closeBtn) return;

    let lastFocused = null;

    function open(key) {
      const build = modalTemplates[key];
      if (!build) return;
      lastFocused = document.activeElement;
      content.innerHTML = build();
      overlay.hidden = false;
      void overlay.offsetWidth; // force reflow so the open transition runs
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
      bindFormsIn(content);
    }

    function close() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(() => {
        overlay.hidden = true;
        content.innerHTML = '';
        lastFocused?.focus();
      }, 300);
    }

    // Single delegated listener handles every trigger, current and future
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-modal], [data-open-modal]');
      if (trigger) {
        open(trigger.dataset.modal || trigger.dataset.openModal);
        return;
      }
      if (e.target.closest('[data-whatsapp]')) {
        window.open('https://wa.me/27767308994', '_blank');
        return;
      }
      if (e.target.closest('[data-close]')) close();
    });

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });
  }

  /* =========================================================
     FORMS — real Formspree endpoints, double-submit guarded
  ========================================================= */
  const FORM_ENDPOINTS = {
    bookingform: 'https://formspree.io/f/xbdejrvg',
    inquiryform: 'https://formspree.io/f/xgobewjj',
  };

  function bindFormsIn(root) {
    Object.keys(FORM_ENDPOINTS).forEach((cls) => {
      const form = root.querySelector(`.${cls}`);
      if (form && !form.dataset.bound) attachFormHandler(form, FORM_ENDPOINTS[cls]);
    });
  }

  function attachFormHandler(form, endpoint) {
    form.dataset.bound = 'true';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn?.disabled) return; // guard against double submit
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          alert('Thank you! We will get back to you soon.');
          form.reset();
        } else {
          alert('Something went wrong. Please try again.');
        }
      } catch (err) {
        console.error('Submission error:', err);
        alert('Network error. Please check your connection and try again.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Static (non-modal) forms present at load, if any exist outside modals
  function initStaticForms() {
    bindFormsIn(document);
  }

  /* =========================================================
     FAQ ACCORDION — native, single-open, debounced resize recalibration
  ========================================================= */
  function initAccordion() {
    const items = document.querySelectorAll('.accordion-item');
    if (!items.length) return;

    items.forEach((item) => {
      const button = item.querySelector('.accordion-button');
      const panel = item.querySelector('.accordion-content');
      if (!button || !panel) return;

      button.addEventListener('click', () => {
        const isOpen = item.classList.contains('active');

        items.forEach((other) => {
          if (other === item) return;
          other.classList.remove('active');
          other.querySelector('.accordion-button')?.setAttribute('aria-expanded', 'false');
          const otherPanel = other.querySelector('.accordion-content');
          if (otherPanel) otherPanel.style.maxHeight = null;
        });

        item.classList.toggle('active', !isOpen);
        button.setAttribute('aria-expanded', String(!isOpen));
        panel.style.maxHeight = isOpen ? null : `${panel.scrollHeight}px`;
      });
    });

    // Keep open panel's max-height correct across viewport/font changes
    window.addEventListener('resize', debounce(() => {
      const openPanel = document.querySelector('.accordion-item.active .accordion-content');
      if (openPanel) openPanel.style.maxHeight = `${openPanel.scrollHeight}px`;
    }, 200), { passive: true });
  }

  /* =========================================================
     GALLERY LIGHTBOX — delegated, keyboard-navigable
  ========================================================= */
  function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    if (!lightbox || !lightboxImg) return;

    let gallery = [];
    let index = 0;

    const refreshGallery = () => {
      gallery = [...document.querySelectorAll('.gallery-masonry img, .masonry img')];
    };

    const show = (i) => {
      if (!gallery.length) return;
      index = (i + gallery.length) % gallery.length;
      lightboxImg.src = gallery[index].src;
      lightboxImg.alt = gallery[index].alt || '';
    };

    const open = (i) => {
      refreshGallery();
      show(i);
      lightbox.classList.add('active');
    };
    const close = () => lightbox.classList.remove('active');

    // Delegated: works for images added later (e.g. gallery modal content)
    document.addEventListener('click', (e) => {
      const img = e.target.closest('.gallery-masonry img, .masonry img');
      if (!img) return;
      refreshGallery();
      open(gallery.indexOf(img));
    });

    document.getElementById('lightboxClose')?.addEventListener('click', close);
    document.getElementById('nextBtn')?.addEventListener('click', () => show(index + 1));
    document.getElementById('prevBtn')?.addEventListener('click', () => show(index - 1));
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });

    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('active')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') show(index + 1);
      if (e.key === 'ArrowLeft') show(index - 1);
    });
  }

  /* =========================================================
     BOOT
  ========================================================= */
  function init() {
    // Critical for first paint / above-the-fold interaction
    initNavbar();
    initMobileMenu();
    initHeroSlideshow();

    // Can wait a tick — below-the-fold / non-blocking
    runWhenIdle(() => {
      initEventSlideshows();
      initModals();
      initStaticForms();
      initAccordion();
      initLightbox();
      initPortfolioToggle();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
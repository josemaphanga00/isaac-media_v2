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

  function initScrollExperience() {
    const progress = document.getElementById('reading-progress');
    let max = 0;
    const measure = () => { max = document.documentElement.scrollHeight - window.innerHeight; };
    measure();
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
    window.addEventListener('resize', measure, { passive: true });
    const updateProgress = () => {
      if (!progress) return;
      progress.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    onScroll(updateProgress);
    updateProgress();

    if (prefersReducedMotion || window.matchMedia('(max-width: 576px)').matches || !('IntersectionObserver' in window)) return;
    const targets = document.querySelectorAll('.package-card, .event-slideshow');
    if (!targets.length) return;
    document.body.classList.add('motion-ready');
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        currentObserver.unobserve(entry.target);
        // Once the entrance has played, hand the element back to its own
        // styles — otherwise .reveal-on-scroll's transform:none and slower
        // transition keep overriding hover lifts (package cards).
        setTimeout(() => entry.target.classList.remove('reveal-on-scroll', 'is-visible'), 1100);
      });
    }, { rootMargin: '0px 0px -56px 0px', threshold: 0.08 });
    targets.forEach((target) => {
      target.classList.add('reveal-on-scroll');
      observer.observe(target);
    });
  }

  // If a responsive candidate (e.g. a gallery-sm thumbnail) is missing,
  // fall back to the full-size src instead of leaving a broken image.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.getAttribute('srcset')) {
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      const src = img.getAttribute('src');
      img.src = '';
      img.src = src;
    }
  }, true);

  function debounce(fn, wait = 150) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // Run non-critical setup when the browser is idle, with a safe fallback
  const runWhenIdle = (callback) => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(callback, { timeout: 1500 });
    } else {
      window.setTimeout(callback, 1);
    }
  };

  /* =========================================================
     NAVBAR — shrink on scroll + active-link highlight via IO
     (replaces Bootstrap ScrollSpy — no scroll-position math needed)
  ========================================================= */
  function initNavbar() {
    const navbar = document.getElementById('mainNav');
    if (!navbar) return;

    /* Shrink + hide-on-scroll-down, reveal-on-scroll-up. Gives the nav
       real presence: it gets out of the way while you're reading down
       the page, then reappears the moment you start scrolling back up
       — you never have to scroll all the way to the top to find it. */
    let lastY = window.scrollY;
    let directionDistance = 0;
    onScroll(() => {
      const y = window.scrollY;
      navbar.classList.toggle('navbar-shrink', y > 8);

      const pastThreshold = y > 120;
      const delta = y - lastY;
      directionDistance = Math.sign(delta) === Math.sign(directionDistance) ? directionDistance + delta : delta;
      if (!pastThreshold) {
        navbar.classList.remove('navbar--hidden');
        directionDistance = 0;
      } else if (Math.abs(directionDistance) >= 12) {
        navbar.classList.toggle('navbar--hidden', directionDistance > 0);
        directionDistance = 0;
      }
      lastY = y;
    });

    const navLinks = [...navbar.querySelectorAll('.nav-links a[href^="#"]')];
    const sections = navLinks
      .map((link) => document.querySelector(link.getAttribute('href')))
      .filter(Boolean);
    if (!sections.length) return;

    /* Sliding indicator under the active link — and a live preview that
       follows the cursor on hover before settling back to whichever
       section you're actually reading */
    const navList = navbar.querySelector('.nav-links');
    let indicator = null;
    if (navList) {
      indicator = document.createElement('span');
      indicator.className = 'nav-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      navList.appendChild(indicator);
    }

    const moveIndicatorTo = (link) => {
      if (!indicator || !link) return;
      indicator.style.width = `${link.offsetWidth}px`;
      indicator.style.transform = `translateX(${link.offsetLeft}px)`;
      indicator.classList.add('visible');
    };

    let activeLink = null;
    const restoreIndicator = () => moveIndicatorTo(activeLink);

    navLinks.forEach((link) => {
      link.addEventListener('mouseenter', () => moveIndicatorTo(link));
    });
    navList?.addEventListener('mouseleave', restoreIndicator);

    if (!('IntersectionObserver' in window)) return;

    const linkFor = (id) => navbar.querySelector(`a[href="#${id}"]`);

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const link = linkFor(entry.target.id);
          if (!link) return;
          if (entry.isIntersecting) {
            navLinks.forEach((l) => l.classList.remove('active'));
            link.classList.add('active');
            activeLink = link;
            restoreIndicator();
          }
        });
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );

    sections.forEach((section) => io.observe(section));

    // Keep the indicator aligned if the layout reflows (font load, resize)
    window.addEventListener('resize', debounce(restoreIndicator, 150), { passive: true });
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

    const desktopImages = [
      'assets/img/hero-section/hero_sabelo.webp',
      'assets/img/hero-section/rings.webp',
      'assets/img/hero-section/wed.webp',
      'assets/img/hero-section/cater.webp',
    ];
    const isMobile = window.matchMedia('(max-width: 576px)').matches || navigator.connection?.saveData;
    const images = isMobile ? ['assets/img/mobile/hero.webp'] : desktopImages;

    // The first slide is in the HTML/CSS so the hero can paint before this
    // deferred script runs. Reuse it, then create only the later slides.
    const slides = [...container.querySelectorAll('.bg-slide')];
    if (!slides.length) {
      const firstSlide = document.createElement('div');
      firstSlide.className = 'bg-slide active';
      container.appendChild(firstSlide);
      slides.push(firstSlide);
    }
    while (slides.length < images.length) {
      const div = document.createElement('div');
      div.className = 'bg-slide';
      container.appendChild(div);
      slides.push(div);
    }
    let current = 0;
    slides[0].classList.add('active');

    // Mobile and data-saver connections keep one compressed hero image and
    // avoid slideshow timers, extra downloads, and full-screen crossfades.
    if (isMobile || prefersReducedMotion) return;

    let timer = null;
    let visible = !document.hidden;

    const load = (i) => {
      // The first frame is a responsive <picture> in the HTML, which also
      // lets Lighthouse measure it as the page's LCP image.
      if (i === 0 && slides[0].querySelector('img')) return;
      if (!slides[i].style.backgroundImage) {
        slides[i].style.backgroundImage = `url('${images[i]}')`;
      }
    };

    const goTo = (i) => {
      const backgroundImage = new Image();
      backgroundImage.decoding = 'async';
      backgroundImage.onload = () => {
        load(i);
        activateSlide(i);
      };
      backgroundImage.onerror = () => activateSlide(i);
      backgroundImage.src = images[i];
      if (backgroundImage.complete) {
        load(i);
        activateSlide(i);
      }
    };

    const activateSlide = (i) => {
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

    // Every crossfade forces all the frosted panels to re-blur, so only run
    // it while the hero is actually on screen.
    let heroInView = true;
    const sync = () => (visible && heroInView ? start() : stop());
    document.addEventListener('visibilitychange', () => { visible = !document.hidden; sync(); });
    const hero = document.getElementById('hero');
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { heroInView = entry.isIntersecting; sync(); }, { threshold: 0.25 }).observe(hero);
    }

    start();
  }

  /* =========================================================
     EVENT MINI SLIDESHOWS — paused when off-screen (IO) and hidden (VA)
  ========================================================= */
  function initEventSlideshows() {
    const groups = document.querySelectorAll('[data-slideshow]');
    if (!groups.length) return;

    groups.forEach((container, groupIndex) => {
      const slides = container.querySelectorAll('.event-slide');
      if (slides.length < 2) return;

      const isMobile = window.matchMedia('(max-width: 576px)').matches || navigator.connection?.saveData;
      let current = 0;
      let timer = null;

      const loadSlide = (i) => new Promise((resolve) => {
        const slide = slides[i];
        if (slide.dataset.loaded === 'true') { resolve(true); return; }
        const src = slide.dataset[isMobile ? 'mobileSrc' : 'desktopSrc'];
        if (!src) { resolve(false); return; }
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
          slide.style.backgroundImage = `url("${src}")`;
          slide.dataset.loaded = 'true';
          resolve(true);
        };
        image.onerror = () => resolve(false);
        image.src = src;
        if (image.complete && image.naturalWidth) {
          slide.style.backgroundImage = `url("${src}")`;
          slide.dataset.loaded = 'true';
          resolve(true);
        }
      });

      const goTo = async (i) => {
        if (!await loadSlide(i)) return;
        slides[current].classList.remove('active');
        slides[i].classList.add('active');
        current = i;
      };
      const start = () => {
        if (prefersReducedMotion || isMobile || timer) return;
        // staggered start so the four crossfades never land on the same frame
        timer = setTimeout(function tick() {
          goTo((current + 1) % slides.length);
          timer = setTimeout(tick, 4000);
        }, 1200 + groupIndex * 1000);
      };
      const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(
          (entries) => entries.forEach((e) => {
            if (e.isIntersecting) {
              loadSlide(current);
              loadSlide((current + 1) % slides.length);
              start();
            } else stop();
          }),
          { threshold: 0.1 }
        ).observe(container);
      } else {
        loadSlide(current);
        start();
      }

      document.addEventListener('visibilitychange', () => {
        document.hidden ? stop() : start();
      });
    });
  }

  // Directory the page lives in ("/" on a custom domain, "/repo/" on a
  // GitHub Pages project site). pushState URLs are built from it so deep
  // links never jump out of the project folder.
  const BASE_PATH = new URL('./', document.baseURI).pathname;
  const toPath = (p) => BASE_PATH + p.replace(/^\//, '');
  const GALLERY_PATH = toPath('/gallery');
  const DEFAULT_TITLE = document.title;

  function openGalleryModal(pushUrl = true) {
    const overlay = document.getElementById('gallery-overlay');
    if (!overlay) return;
    if (!overlay.dataset.imagesPrepared) {
      prepareGalleryImages(overlay);
      overlay.dataset.imagesPrepared = 'true';
    }
    overlay.hidden = false;
    void overlay.offsetWidth;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (pushUrl && location.pathname !== GALLERY_PATH) {
      history.pushState({ gallery: true }, '', GALLERY_PATH);
    }
    document.title = 'Gallery | ISAAC MEDIA';
  }

  function closeGalleryModal(pushUrl = true) {
    const overlay = document.getElementById('gallery-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { overlay.hidden = true; }, 300);
    if (pushUrl && location.pathname === GALLERY_PATH) {
      history.replaceState({}, '', BASE_PATH);
    }
    document.title = DEFAULT_TITLE;
  }

  /* The gallery holds ~70 photos. Native loading="lazy" still pulls in several
     screens' worth the moment it opens, so the images are handed to an
     IntersectionObserver that releases each one only ~400px before it
     scrolls into view. Original src stays in data-src (lightbox uses it). */
  function prepareGalleryImages(overlay) {
    const scroller = overlay.querySelector('.gallery-overlay-scroll');
    const imgs = [...overlay.querySelectorAll('.gallery-masonry img')];
    if (!scroller || !imgs.length || !('IntersectionObserver' in window)) return;
    const release = (img) => {
      if (img.dataset.srcset) img.srcset = img.dataset.srcset;
      if (img.dataset.sizes) img.sizes = img.dataset.sizes;
      img.src = img.dataset.src;
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        release(entry.target);
      });
    }, { root: scroller, rootMargin: '400px 0px' });
    imgs.forEach((img) => {
      img.dataset.src = img.getAttribute('src');
      if (img.hasAttribute('srcset')) img.dataset.srcset = img.getAttribute('srcset');
      if (img.hasAttribute('sizes')) img.dataset.sizes = img.getAttribute('sizes');
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.removeAttribute('src');
      img.removeAttribute('loading'); // the observer is the lazy-loader now
      io.observe(img);
    });
  }

  function initGalleryModal() {
    const overlay = document.getElementById('gallery-overlay');
    const trigger = document.getElementById('portfolio-toggle');
    const closeBtn = document.getElementById('gallery-close');
    if (!overlay || !trigger) return;
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openGalleryModal();
    });
    closeBtn?.addEventListener('click', () => closeGalleryModal());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeGalleryModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !overlay.hidden && !event.defaultPrevented) closeGalleryModal();
    });
    window.addEventListener('popstate', () => {
      if (location.pathname === GALLERY_PATH) openGalleryModal(false);
      else closeGalleryModal(false);
    });
    if (location.pathname === GALLERY_PATH) openGalleryModal(false);
  }

  /* =========================================================
    MODAL SYSTEM — quick booking and inquiry forms, with direct-link support
  ========================================================= */
  const MODAL_ROUTES = {
    about:    { path: '/about', title: 'About | ISAAC MEDIA' },
    booking:  { path: '/booking', title: 'Book a Session | ISAAC MEDIA' },
    inquiry:  { path: '/inquiry', title: 'Ask a Question | ISAAC MEDIA' },
    package1: { path: '/packages/starter', title: 'Starter Package | ISAAC MEDIA' },
    package2: { path: '/packages/standard', title: 'Standard Package | ISAAC MEDIA' },
    package3: { path: '/packages/premium', title: 'Premium Package | ISAAC MEDIA' },
  };
  Object.values(MODAL_ROUTES).forEach((route) => { route.path = toPath(route.path); });
  const PATH_TO_MODAL_KEY = Object.fromEntries(
    Object.entries(MODAL_ROUTES).map(([key, route]) => [route.path, key])
  );

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
            Enquire More<svg class="btn-icon icon-trailing" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.05-1.36A10 10 0 1 0 12 2zm0 18.2a8.15 8.15 0 0 1-4.16-1.14l-.3-.18-3.1.84.83-3.02-.2-.31A8.2 8.2 0 1 1 12 20.2zm4.5-6.13c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.78.95-.14.16-.28.18-.53.06-.24-.12-1.02-.38-1.95-1.21-.72-.64-1.2-1.44-1.35-1.68-.14-.24-.02-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.42-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.13 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28z"/></svg>
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
      <div class="image-wrapper image-wrapper--portrait">
        <img class="img-fluid d-block mx-auto about-modal-img" src="assets/img/isaac-ngobeni/isaac2.webp" srcset="assets/img/mobile/about-isaac.webp 800w" sizes="300px" width="1200" height="1800" alt="Isaac Media" loading="lazy" decoding="async">
      </div>
      <p class="about-text">Isaac Media is a creative visual brand founded by Isaac Ngobeni, a passionate photographer and videographer dedicated to capturing life's most meaningful moments with authenticity and excellence.</p>
      <p class="about-text">With over 10 years of experience in videography, 4 years in video editing, and 4 years in professional photography, Isaac brings a unique storytelling approach shaped by his journey behind the camera.</p>
      <p class="about-text">Isaac Media specializes in wedding, lifestyle, event, and family photography, creating timeless visuals that reflect genuine emotion, connection, and detail.</p>
      <p class="about-text">Founded in August 2022, the brand was built on a long-standing passion that began at the age of 16 while serving in the church media department.</p>
      <div class="modal-btn-group"><button class="btn btn-primary btn-xl text-uppercase" data-close>Close About</button></div>
    `,
    package1: () => packageTemplate({
      title: 'Starter', price: 'R9,000', tagline: 'Perfect for intimate moments and smaller celebrations.',
      img: 'assets/img/package-img/msiza.webp', mobileImg: 'assets/img/mobile/package-msiza.webp', items: ['9 Hours of Photography', '1 Photographer', 'Professional Editing', '300+ High-Resolution Photos', 'Digital Delivery'],
    }),
    package2: () => packageTemplate({
      title: 'Standard', price: 'R15,500', tagline: 'For a fuller, more memorable experience.',
      img: 'assets/img/package-img/is3.webp', mobileImg: 'assets/img/mobile/package-is3.webp', items: ['Complimentary Engagement Shoot', '9 Hours of Photography', '1 Photographer', '300+ High-Resolution Photos', 'Digital Delivery', '40-Page Photobook'],
    }),
    package3: () => packageTemplate({
      title: 'Premium', price: 'R23,500', tagline: 'For clients who want everything captured and preserved beautifully.',
      img: 'assets/img/package-img/sandrasabelo.webp', mobileImg: 'assets/img/mobile/package-sandrasabelo.webp', items: ['Complimentary Engagement Shoot', '1 Hour Bridal Shower Coverage', '9 Hours of Photography', '1 Photographer', 'Professional Editing', '300+ High-Resolution Photos', '5-Minute Highlight Video', 'Digital Delivery + Online Gallery', '40-Page Photobook'],
    }),
  };

  function packageTemplate({ title, price, tagline, img, mobileImg, items }) {
    return `
      <h2 class="text-uppercase">${title}</h2>
      <p class="item-intro text-muted">Isaac Media</p>
      <div class="image-wrapper image-wrapper--portrait"><img class="img-fluid d-block mx-auto" src="${img}" srcset="${mobileImg} 760w" sizes="300px" width="1200" height="1800" alt="${title} package" loading="lazy" decoding="async"></div>
      <h5>${tagline}</h5>
      <ul class="list-inline">${items.map((item) => `<li>${item}</li>`).join('')}</ul>
      <h5>${price}</h5>
      <div class="modal-btn-group">
        <a href="/booking" class="btn btn-book btn-xl text-uppercase" data-open-modal="booking">Book Session</a>
        <button class="btn btn-primary btn-xl text-uppercase" data-whatsapp>Enquire More</button>
      </div>
    `;
  }

  function initModals() {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');
    if (!overlay || !content || !closeBtn) return;

    let lastFocused = null;
    let currentKey = null;
    let returnUrl = null;

    function open(key, pushUrl = true) {
      const build = modalTemplates[key];
      if (!build) return;
      lastFocused = document.activeElement;
      content.innerHTML = build();
      content.querySelector('h2')?.setAttribute('id', 'modal-heading');
      content.classList.remove('modal-content--enter');
      void content.offsetWidth; // force reflow so the animation replays every open, not just the first
      content.classList.add('modal-content--enter');
      overlay.hidden = false;
      void overlay.offsetWidth; // force reflow so the open transition runs
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
      bindFormsIn(content);
      if (key === 'booking') {
        const requestedPackage = new URLSearchParams(location.search).get('package');
        const packageSelect = content.querySelector('[name="weddingPackage"]');
        if (requestedPackage && [...(packageSelect?.options || [])].some((option) => option.value === requestedPackage)) {
          packageSelect.value = requestedPackage;
        }
      }

      currentKey = key;
      const route = MODAL_ROUTES[key];
      if (route) {
        if (pushUrl && location.pathname !== route.path) {
          returnUrl = location.href;
          history.pushState({ modal: key }, '', route.path);
        }
        document.title = route.title;
      }
    }

    function close(pushUrl = true) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(() => {
        overlay.hidden = true;
        content.innerHTML = '';
        lastFocused?.focus();
      }, 300);

      const route = currentKey && MODAL_ROUTES[currentKey];
      if (pushUrl && route && location.pathname === route.path) {
        history.replaceState({}, '', returnUrl || BASE_PATH);
        returnUrl = null;
      } else if (pushUrl && new URLSearchParams(location.search).has('modal')) {
        const url = new URL(location.href);
        url.searchParams.delete('modal');
        url.searchParams.delete('package');
        history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
      document.title = DEFAULT_TITLE;
      currentKey = null;
    }

    // Single delegated listener handles every trigger, current and future
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-modal], [data-open-modal]');
      if (trigger) {
        e.preventDefault(); // real hrefs stay for crawlers/no-JS; JS intercepts for the SPA modal
        open(trigger.dataset.modal || trigger.dataset.openModal);
        return;
      }
      if (e.target.closest('[data-whatsapp]')) {
        window.open('https://wa.me/27767308994', '_blank');
        return;
      }
      if (e.target.closest('[data-close]')) close();
    });

    closeBtn.addEventListener('click', () => close());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
      if (overlay.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const focusable = [...overlay.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first?.focus();
        }
      }
    });

    window.addEventListener('popstate', () => {
      const key = PATH_TO_MODAL_KEY[location.pathname]
        || new URLSearchParams(location.search).get('modal');
      if (key) open(key, false);
      else if (currentKey) close(false);
    });

    // Direct query-string links work without server-side route rewrites.
    const requestedModal = new URLSearchParams(location.search).get('modal');
    const initialKey = PATH_TO_MODAL_KEY[location.pathname]
      || (modalTemplates[requestedModal] ? requestedModal : null);
    if (initialKey) open(initialKey, false);
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

  /* ---------------------------------------------------------------
     FORM FEEDBACK — one reusable frosted-glass dialog replaces alert().
     Built lazily on first use; focus is trapped on its button and
     returned to wherever the visitor was; Esc / backdrop / button close.
  --------------------------------------------------------------- */
  const NOTICE_ICONS = {
    success: '<svg viewBox="0 0 52 52" aria-hidden="true"><circle class="notice-ring" cx="26" cy="26" r="24"/><path class="notice-mark" d="M15 27l8 8 14-16"/></svg>',
    error: '<svg viewBox="0 0 52 52" aria-hidden="true"><circle class="notice-ring" cx="26" cy="26" r="24"/><path class="notice-mark" d="M18 18l16 16M34 18L18 34"/></svg>',
  };
  let noticeEl = null, noticeReturnFocus = null, noticeOnClose = null;

  function closeNotice() {
    if (!noticeEl || noticeEl.hidden) return;
    noticeEl.classList.remove('open');
    const el = noticeEl, cb = noticeOnClose;
    noticeOnClose = null;
    setTimeout(() => { el.hidden = true; }, 300);
    if (cb) cb();
    else if (noticeReturnFocus && document.contains(noticeReturnFocus)) noticeReturnFocus.focus();
  }

  function showNotice({ type = 'success', title, message, button = 'Done', onClose }) {
    if (!noticeEl) {
      noticeEl = document.createElement('div');
      noticeEl.className = 'notice-overlay';
      noticeEl.hidden = true;
      noticeEl.innerHTML = '<div class="notice" role="alertdialog" aria-modal="true" aria-labelledby="notice-title" aria-describedby="notice-msg">' +
        '<div class="notice-icon"></div><h3 id="notice-title"></h3><p id="notice-msg"></p>' +
        '<button type="button" class="btn btn-primary btn-xl text-uppercase notice-btn"></button></div>';
      document.body.appendChild(noticeEl);
      noticeEl.addEventListener('click', (e) => { if (e.target === noticeEl || e.target.closest('.notice-btn')) closeNotice(); });
      document.addEventListener('keydown', (e) => {
        if (noticeEl.hidden) return;
        if (e.key === 'Escape') { e.stopPropagation(); closeNotice(); }
        if (e.key === 'Tab') { e.preventDefault(); noticeEl.querySelector('.notice-btn').focus(); }
      }, true);
    }
    noticeReturnFocus = document.activeElement;
    noticeOnClose = onClose || null;
    noticeEl.dataset.type = type;
    noticeEl.querySelector('.notice-icon').innerHTML = NOTICE_ICONS[type];
    noticeEl.querySelector('#notice-title').textContent = title;
    noticeEl.querySelector('#notice-msg').textContent = message;
    noticeEl.querySelector('.notice-btn').textContent = button;
    noticeEl.hidden = false;
    void noticeEl.offsetWidth;            // flush so the entrance transition runs
    noticeEl.classList.add('open');
    noticeEl.querySelector('.notice-btn').focus();
  }

  const FORM_COPY = {
    bookingform: {
      title: (n) => n ? 'Thank you, ' + n + '.' : 'Thank you.',
      message: 'Your booking request is in. Isaac will review your date and get back to you within 24 hours.',
    },
    inquiryform: {
      title: (n) => n ? 'Message received, ' + n + '.' : 'Message received.',
      message: 'Thanks for reaching out. We will reply to your enquiry as soon as we can.',
    },
  };

  function attachFormHandler(form, endpoint) {
    form.dataset.bound = 'true';
    const copy = FORM_COPY[Object.keys(FORM_ENDPOINTS).find((c) => form.classList.contains(c))] || FORM_COPY.inquiryform;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn?.disabled) return; // guard against double submit
      if (submitBtn) submitBtn.disabled = true;
      const label = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) submitBtn.textContent = 'Sending…';

      try {
        const data = new FormData(form);
        const res = await fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
        if (res.ok) {
          const first = String(data.get('fullName') || data.get('full_name') || '').trim().split(/\s+/)[0];
          form.reset();
          showNotice({
            type: 'success', title: copy.title(first), message: copy.message,
            // inside a modal → close it too once the visitor dismisses the notice
            onClose: () => document.getElementById('modal-close')?.click(),
          });
        } else {
          showNotice({ type: 'error', title: 'Something went wrong', message: 'Your message was not sent. Please try again, or reach us on WhatsApp.', button: 'Try again' });
        }
      } catch (err) {
        console.error('Submission error:', err);
        showNotice({ type: 'error', title: 'No connection', message: 'We could not reach the server. Check your internet and try again.', button: 'Try again' });
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = label; }
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

  /* ---------------------------------------------------------------
     REVIEWS CAROUSEL
     Native scroll-snap does the motion; JS only wires the buttons,
    dots and a11y. Only approved, genuine client reviews belong in REVIEWS;
    the visible empty state remains until real copy is added.
     Visit /?reviews=preview to see the layout with clearly-labelled
     sample cards (never shown to normal visitors).
  --------------------------------------------------------------- */
  // DRAFT copy from the original mock-up — replace with real, client-approved
  // reviews before launch. Leave this array empty and the section falls back
  // to the "Share your experience" card instead.
  const REVIEWS = [
    { name: "Sarah & John", meta: "Wedding", rating: 5, text: "ISAAC MEDIA captured our wedding beautifully. Every moment was perfect." },
    { name: "Emily & Michael", meta: "Wedding", rating: 5, text: "Professional, creative, and a joy to work with. The photos exceeded our expectations." },
    { name: "Jessica & David", meta: "Wedding", rating: 5, text: "Absolutely stunning work! The team made us feel so comfortable." },
    { name: "Thabo & Lerato", meta: "Wedding", rating: 5, text: "From the first call to the final gallery, everything felt effortless. We still look at our photos every week." },
    { name: "Naledi M.", meta: "Birthday Shoot", rating: 5, text: "Isaac made me feel confident in front of the camera. The edits were clean, bold and delivered fast." },
    { name: "Kagiso & Palesa", meta: "Engagement", rating: 5, text: "Relaxed, creative and so easy to work with. Every frame feels like us." },
  ];
  const PREVIEW_REVIEWS = [1, 2, 3, 4].map((n) => ({
    name: "Sample Client " + n, meta: "Preview only", rating: 5,
    text: "Sample review text for layout preview. Replace with a real client review."
  }));

  function initReviews() {
    const section = document.getElementById('reviews');
    const track = document.getElementById('reviews-track');
    const dotsWrap = document.getElementById('reviews-dots');
    if (!section || !track || !dotsWrap) return;

    const preview = /[?&]reviews=preview\b/.test(location.search);
    const data = REVIEWS.length ? REVIEWS : (preview ? PREVIEW_REVIEWS : []);
    if (!data.length) return;

    section.querySelector('#reviews-empty-state').hidden = true;
    section.querySelector('.reviews-carousel').hidden = false;
    section.querySelector('.reviews-more').hidden = false;

    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21.1 7 14.2 2 9.3l6.9-1z"/></svg>';
    const quote = '<svg class="review-quote-icon" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.2 6C4.9 7.4 3.5 9.6 3.5 12.6V18h6v-6H6.4c.1-1.6.9-2.9 2.3-3.8zm9.5 0c-2.3 1.4-3.7 3.6-3.7 6.6V18h6v-6h-3.1c.1-1.6.9-2.9 2.3-3.8z"/></svg>';

    track.innerHTML = data.map((r, i) => {
      const initials = r.name.split(/\s+/).filter((p) => /^[A-Za-z]/.test(p)).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
      const stars = star.repeat(Math.max(1, Math.min(5, r.rating || 5)));
      return '<figure class="review-card" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' of ' + data.length + '">' +
        quote + '<div class="stars" role="img" aria-label="' + (r.rating || 5) + ' out of 5 stars">' + stars + '</div>' +
        '<blockquote class="review-text">' + esc(r.text) + '</blockquote>' +
        '<figcaption class="review-author"><span class="review-avatar">' + esc(initials) + '</span><span><span class="review-name">' + esc(r.name) + '</span><span class="review-meta">' + esc(r.meta || '') + '</span></span></figcaption></figure>';
    }).join('');
    section.hidden = false;

    const cards = Array.from(track.children);
    const prev = section.querySelector('[data-reviews-prev]');
    const next = section.querySelector('[data-reviews-next]');
    const gap = () => parseFloat(getComputedStyle(track).columnGap) || 20;
    const cardStep = () => cards[0].getBoundingClientRect().width + gap();
    // Cards visible at once: 3 desktop, 2 tablet, 1 phone — one "page" each
    const perView = () => Math.max(1, Math.round((track.clientWidth + gap()) / cardStep()));
    const pageCount = () => Math.ceil(cards.length / perView());
    const currentPage = () => Math.round(track.scrollLeft / (cardStep() * perView()));

    function buildDots() {
      const n = pageCount();
      dotsWrap.innerHTML = Array.from({ length: n }, (_, i) =>
        '<button type="button" class="reviews-dot" role="tab" aria-label="Reviews page ' + (i + 1) + '" data-i="' + i + '"></button>').join('');
      const single = n <= 1;
      dotsWrap.hidden = prev.hidden = next.hidden = single;
    }
    // Wraps around so the arrows are always live: last page → first
    function goToPage(p) {
      const n = pageCount();
      p = (p + n) % n;
      const first = Math.min(p * perView(), cards.length - perView());
      track.scrollTo({ left: first * cardStep(), behavior: 'smooth' });
    }
    let ticking = false;
    function sync() {
      ticking = false;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      const page = atEnd ? pageCount() - 1 : currentPage();
      Array.from(dotsWrap.children).forEach((d, n) => d.setAttribute('aria-selected', String(n === page)));
    }
    track.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(sync); } }, { passive: true });
    prev.addEventListener('click', () => goToPage(currentPage() - 1));
    next.addEventListener('click', () => goToPage(currentPage() + 1));
    dotsWrap.addEventListener('click', (e) => { const d = e.target.closest('[data-i]'); if (d) goToPage(+d.dataset.i); });
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
    });
    let lastPer = 0;
    window.addEventListener('resize', () => { if (perView() !== lastPer) { lastPer = perView(); buildDots(); } sync(); }, { passive: true });
    lastPer = perView(); buildDots(); sync();
  }

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
    let returnFocus = null;
    const portfolioImages = '.page-gallery img, .gallery-masonry img';

    const refreshGallery = () => {
      gallery = [...document.querySelectorAll(portfolioImages)];
    };

    const show = (i) => {
      if (!gallery.length) return;
      index = (i + gallery.length) % gallery.length;
      lightboxImg.src = gallery[index].dataset.src || gallery[index].src;
      lightboxImg.alt = gallery[index].alt || '';
    };

    const open = (i) => {
      refreshGallery();
      show(i);
      returnFocus = gallery[i];
      lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';
      document.getElementById('lightboxClose')?.focus();
    };
    const close = () => {
      lightbox.classList.remove('active');
      const galleryOpen = !document.getElementById('gallery-overlay')?.hidden;
      document.body.style.overflow = galleryOpen ? 'hidden' : '';
      returnFocus?.focus?.();
    };

    // Delegated — only images inside the gallery modal are clickable;
    // the main-page preview grid is hover-only (see .masonry img in CSS)
    document.addEventListener('click', (e) => {
      const img = e.target.closest(portfolioImages);
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
      if (e.key === 'Escape') { e.preventDefault(); close(); } // preventDefault tells the gallery behind us not to close too
      if (e.key === 'ArrowRight') show(index + 1);
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'Tab') {
        const controls = [...lightbox.querySelectorAll('button')];
        if (e.shiftKey && document.activeElement === controls[0]) {
          e.preventDefault(); controls.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === controls.at(-1)) {
          e.preventDefault(); controls[0]?.focus();
        }
      }
    });
  }

  /* =========================================================
     BOOT
  ========================================================= */
  function init() {
    // Critical for first paint / above-the-fold interaction
    initScrollExperience();
    initNavbar();
    initMobileMenu();
    initHeroSlideshow();
    // Install controls immediately so modal links work even while the browser
    // is busy and has not run its idle callbacks yet.
    initModals();
    initLightbox();
    initGalleryModal();

    // Can wait a tick — below-the-fold / non-blocking
    runWhenIdle(() => {
      initEventSlideshows();
      initStaticForms();
      initAccordion();
      initReviews();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

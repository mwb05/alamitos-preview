/* =============================================================================
   The Alamitos Group — "Fifteen Stores"
   Shop-floor motion: a bay door on load, odometer digits that roll into place,
   and a pinned pit stop you scroll through sideways.
   GSAP is optional; everything degrades to a documented static form.
   ============================================================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  var useGsap = hasGsap && !reduced;
  var mqMobile = window.matchMedia('(max-width: 860px)');

  if (useGsap) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  /* ---------- bay door: lifts on hero load, error, or a hard timeout ---------- */
  (function bayDoor() {
    var body = document.body;
    if (body.classList.contains('is-loaded')) return;
    var done = false;
    function open() { if (!done) { done = true; body.classList.add('is-loaded'); } }
    var hero = document.querySelector('.hero-media img');
    if (hero) {
      if (hero.complete) open();
      else { hero.addEventListener('load', open); hero.addEventListener('error', open); }
    }
    setTimeout(open, 1600); // never hold the page hostage to a slow image
  })();

  /* ---------- header ---------- */
  (function header() {
    var head = document.querySelector('.site-header');
    if (!head) return;
    var last = window.scrollY, idle = null;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (!head.classList.contains('nav-open')) {
        if (y > last && y > 240) head.classList.add('hidden');
        else head.classList.remove('hidden');
        if (mqMobile.matches) {
          clearTimeout(idle);
          idle = setTimeout(function () { head.classList.remove('hidden'); }, 220);
        }
      }
      last = y;
    }, { passive: true });
  })();

  /* ---------- mobile nav ---------- */
  (function nav() {
    var toggle = document.querySelector('.nav-toggle');
    var panel = document.getElementById('main-nav');
    var head = document.querySelector('.site-header');
    if (!toggle || !panel) return;
    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('open', open);
      document.body.classList.toggle('nav-lock', open);
      if (head) { head.classList.toggle('nav-open', open); if (open) head.classList.remove('hidden'); }
    }
    toggle.addEventListener('click', function () { setOpen(toggle.getAttribute('aria-expanded') !== 'true'); });
    panel.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    mqMobile.addEventListener('change', function (e) { if (!e.matches) setOpen(false); });
  })();

  /* ---------- reveals ---------- */
  (function reveals() {
    var targets = document.querySelectorAll('[data-reveal], .lines');
    if (!('IntersectionObserver' in window) || reduced) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    targets.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- odometer: digits roll up into place like a mileage counter ---------- */
  (function odometer() {
    var odos = document.querySelectorAll('.odometer[data-value]');
    if (!odos.length) return;

    odos.forEach(function (odo) {
      var value = String(odo.getAttribute('data-value'));
      var suffix = odo.getAttribute('data-suffix') || '';
      var frag = document.createDocumentFragment();

      value.split('').forEach(function (ch) {
        if (!/[0-9]/.test(ch)) {
          var lit = document.createElement('span');
          lit.className = 'lit';
          lit.textContent = ch;
          frag.appendChild(lit);
          return;
        }
        // A 0-9 column inside a 1em window; translate to show the right digit.
        var wrap = document.createElement('span');
        wrap.className = 'digit';
        var strip = document.createElement('span');
        for (var n = 0; n <= 9; n++) {
          var d = document.createElement('i');
          d.textContent = String(n);
          strip.appendChild(d);
        }
        strip.setAttribute('data-target', ch);
        wrap.appendChild(strip);
        frag.appendChild(wrap);
      });

      if (suffix) {
        var sfx = document.createElement('span');
        sfx.className = 'suffix';
        sfx.textContent = suffix;
        frag.appendChild(sfx);
      }
      odo.textContent = '';
      odo.appendChild(frag);
      // The odometer is a picture of a number: the digit columns each contain 0-9, so
      // without this a screen reader reads the whole strip instead of the value.
      [].forEach.call(odo.children, function (c) { c.setAttribute('aria-hidden', 'true'); });
      odo.setAttribute('role', 'img');
      odo.setAttribute('aria-label', value + (suffix ? ' ' + suffix : ''));
    });

    function roll(odo) {
      odo.querySelectorAll('.digit > span').forEach(function (strip, i) {
        var target = Number(strip.getAttribute('data-target'));
        strip.style.transitionDelay = (i * 0.08) + 's';
        // Land on the digit; without motion just snap.
        strip.style.transform = 'translateY(-' + (target * 10) + '%)';
      });
    }

    if (!('IntersectionObserver' in window)) { odos.forEach(roll); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        roll(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.4 });
    odos.forEach(function (o) { io.observe(o); });
  })();

  /* ---------- the visit: pinned horizontal pit stop ---------- */
  (function visit() {
    var section = document.querySelector('.visit');
    if (!section) return;
    var viewport = section.querySelector('.visit-viewport');
    var track = section.querySelector('.visit-track');
    var bar = section.querySelector('.visit-bar i');
    if (!viewport || !track) return;

    // Without GSAP (or on a phone) the same markup is a native swipe carousel.
    if (!useGsap || mqMobile.matches) {
      section.classList.add('is-static');
      // The viewport is now a horizontal scroll region and its cards are not links,
      // so without this a keyboard user cannot reach or scroll it at all.
      viewport.setAttribute('tabindex', '0');
      viewport.setAttribute('role', 'group');
      viewport.setAttribute('aria-label', 'The steps of a visit. Scroll sideways to see each one.');
      return;
    }

    var distance = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };

    gsap.to(track, {
      x: function () { return -distance(); },
      ease: 'none',
      scrollTrigger: {
        trigger: viewport,
        start: 'top top',
        end: function () { return '+=' + distance(); },
        pin: true, scrub: 1, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: function (self) {
          if (bar) bar.style.transform = 'scaleX(' + self.progress + ')';
        }
      }
    });
  })();

  /* ---------- current year ---------- */
  (function year() {
    var y = String(new Date().getFullYear());
    document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = y; });
  })();
})();

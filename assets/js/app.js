/* ==========================================================================
   Nichols Land & Investment Co. — site scripts
   Vanilla JS, no build step. Data comes from /data/*.json
   ========================================================================== */

const NLI = (() => {
  'use strict';

  const state = {
    properties: [],
    saved: new Set()
  };

  /* --- utilities ---------------------------------------------------------- */

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const money = (n) => n == null ? null : '$' + n.toLocaleString('en-US');

  const acresFmt = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  async function loadJSON(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
    return res.json();
  }

  /* The whole site is two files at the root: index.html and properties.html. */
  const ROOT = './';

  async function getProperties() {
    if (!state.properties.length) {
      state.properties = await loadJSON(ROOT + 'data/properties.json');
    }
    return state.properties;
  }

  /* --- chrome: nav, header, reveal ---------------------------------------- */

  function initChrome() {
    const toggle = $('.nav-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const open = document.body.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
      $$('.nav a').forEach(a => a.addEventListener('click', () => {
        document.body.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      }));
    }

    const header = $('.site-header');
    if (header && header.classList.contains('site-header--over')) {
      const onScroll = () => {
        header.classList.toggle('site-header--over', window.scrollY < 60);
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // Reveal on scroll
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -60px 0px', threshold: 0.08 });
    $$('.reveal').forEach(el => io.observe(el));

    // Current year in footers
    $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

    initScrollProgress();
    initScrollSpy();
  }

  /* --- scroll progress bar ------------------------------------------------- */

  function initScrollProgress() {
    const bar = $('[data-progress] i');
    if (!bar) return;
    let ticking = false;

    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = `scaleX(${pct.toFixed(4)})`;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* --- scrollspy ----------------------------------------------------------
     Highlights the nav link for whichever section owns the viewport.
     Uses scroll position rather than IntersectionObserver because sections
     here are very different heights — "most recently passed" reads better
     than "currently intersecting".
     ------------------------------------------------------------------------ */

  function initScrollSpy() {
    const nav = $('[data-scrollspy]');
    if (!nav) return;

    const links = $$('a[href^="#"]', nav);
    if (!links.length) return;

    const targets = links
      .map(a => ({ link: a, el: document.getElementById(a.getAttribute('href').slice(1)) }))
      .filter(t => t.el);
    if (!targets.length) return;

    let ticking = false;

    const update = () => {
      ticking = false;
      const line = window.scrollY + window.innerHeight * 0.32;
      let active = null;
      targets.forEach(t => { if (t.el.offsetTop <= line) active = t; });

      // Bottom of page always lights the last section, even if it's short.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        active = targets[targets.length - 1];
      }

      links.forEach(a => a.removeAttribute('aria-current'));
      if (active) active.link.setAttribute('aria-current', 'true');
    };

    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* --- reactive hero ------------------------------------------------------
     Scroll parallax + cursor/device tilt on the hero plate.
     Everything here is progressive: with JS off, or reduced motion, or no
     video support, the hero falls back to the static poster image.
     ------------------------------------------------------------------------ */

  /* --- hero background rotation -------------------------------------------
     Cycles the hero through its slides — Land, Commercial, Timber — dissolving
     between them and wrapping back to the first.

     A slide advances on whichever signal it has: a clip advances when it
     fires `ended`, a still advances on a timer. Slides are lazy — nothing
     past the first is fetched until its turn is close — so adding backgrounds
     costs nothing on first paint, which is the whole reason the hero can
     afford three of them.

     Everything degrades by subtraction. A slide whose media 404s is dropped
     from the ring; if that leaves one slide it simply loops, which is exactly
     the behaviour the hero had before any of this existed.
     ---------------------------------------------------------------------- */

  const HERO_HOLD_MS  = 6500;   // default dwell for a still
  const HERO_FADE_MS  = 1200;   // must match .hero__slide transition in CSS
  const HERO_ARM_LEAD = 2500;   // start fetching the next slide this early

  function initHeroRotation(stage, firstVideo, playFirst) {
    if (!stage || !stage.hasAttribute('data-hero-rotator')) return;

    const slides = Array.prototype.slice.call(stage.querySelectorAll('[data-hero-slide]'));
    if (slides.length < 2) return;   // nothing to rotate between

    // Each slide is described once, up front, so the loop below never has to
    // re-interrogate the DOM to find out what kind of thing it is holding.
    const ring = slides.map((el) => ({
      el,
      video: el.querySelector('video'),
      img:   el.querySelector('img'),
      hold:  parseInt(el.getAttribute('data-hold'), 10) || HERO_HOLD_MS,
      dead:  false
    }));

    let index   = 0;
    let timer   = null;
    let armed   = null;   // slide we've already started fetching
    let stopped = false;

    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const live  = () => ring.filter(s => !s.dead);
    const at    = (i) => ring[i];

    // Hand the stage over to the rotation only once slide 1 is actually up,
    // so the base still keeps covering the gap until there is something to
    // cover it with.
    stage.classList.add('is-rotating');

    /* --- loading ---------------------------------------------------------
       A <video> in slide 2+ ships with no preload; we set it when its turn is
       near. Calling load() after changing preload is what actually starts the
       fetch in Safari, which ignores the attribute change on its own. */
    const arm = (slot) => {
      if (!slot || slot === armed || slot.dead) return;
      armed = slot;
      if (slot.video) {
        slot.video.preload = 'auto';
        try { slot.video.load(); } catch (e) { /* nothing to recover */ }
      } else if (slot.img) {
        // Promote it out of lazy so it is decoded before it is shown rather
        // than fading in half-painted. Driven off the attribute, not the
        // .loading property — the property is unreflected in older Safari and
        // silently swallows the assignment.
        if (slot.img.getAttribute('loading') === 'lazy') {
          slot.img.setAttribute('loading', 'eager');
        }
        slot.img.setAttribute('fetchpriority', 'high');
        // decode() resolves once the bitmap is ready, so the dissolve starts
        // against a painted frame instead of an empty box.
        if (typeof slot.img.decode === 'function') slot.img.decode().catch(() => {});
      }
    };

    const kill = (slot) => {
      slot.dead = true;
      slot.el.classList.remove('is-current');
      // One survivor means there is nothing to cut to — restore the plain
      // looping clip the hero shipped with.
      const rest = live();
      if (rest.length === 1 && rest[0].video) rest[0].video.loop = true;
      if (rest.length === 0) {
        stopped = true;
        stage.classList.remove('is-rotating', 'is-playing');
      }
    };

    ring.forEach((slot) => {
      if (!slot.video && !slot.img) { slot.dead = true; return; }

      // A slide carrying both a clip and a still has somewhere to fall back
      // to: drop the clip, keep the slide, and let it run as a still. Only a
      // slide with nothing left to show is removed from the ring.
      if (slot.video) {
        slot.video.addEventListener('error', () => {
          const wasCurrent = slot.el.classList.contains('is-current');
          slot.video.remove();
          slot.video = null;
          if (!slot.img) {
            kill(slot);
            if (wasCurrent && !stopped) { clear(); advance(); }
          } else if (wasCurrent) {
            // The still underneath is already in place; just re-time the slide
            // so it hands off on the still's schedule instead of waiting for
            // an `ended` that can never arrive.
            clear();
            schedule();
          }
        });
      }
      if (slot.img) {
        slot.img.addEventListener('error', () => {
          const wasCurrent = slot.el.classList.contains('is-current');
          if (slot.video) return;   // clip still carries this slide
          kill(slot);
          if (wasCurrent && !stopped) { clear(); advance(); }
        });
      }
    });

    /* --- the step -------------------------------------------------------- */
    function advance() {
      if (stopped) return;
      const rest = live();
      if (rest.length < 2) return;   // single survivor loops on its own

      const from = at(index);
      // Walk forward to the next slide that is still alive.
      let next = index;
      for (let n = 0; n < ring.length; n++) {
        next = (next + 1) % ring.length;
        if (!at(next).dead) break;
      }
      if (next === index) return;

      const to = at(next);
      index = next;

      // Bring the incoming slide up first, then drop the outgoing one. Both
      // are opaque mid-dissolve, which is what keeps the hero from flashing
      // the page background between scenes.
      arm(to);
      if (to.video) {
        to.video.currentTime = 0;
        to.video.muted = true;
        const p = to.video.play();
        if (p && p.catch) p.catch(() => { /* covered by the still beneath */ });
      } else if (to.img) {
        // Restart the drift by forcing a reflow between removals.
        to.img.style.animation = 'none';
        void to.img.offsetWidth;
        to.img.style.animation = '';
      }

      to.el.classList.add('is-current');
      from.el.classList.remove('is-current');

      // Park the outgoing clip once it is fully hidden. Rewinding here rather
      // than on the way in means the next turn starts on a decoded frame.
      if (from.video) {
        setTimeout(() => {
          if (from.el.classList.contains('is-current')) return;
          try { from.video.pause(); from.video.currentTime = 0; } catch (e) {}
        }, HERO_FADE_MS);
      }

      schedule();
    }

    /* --- when to step next ----------------------------------------------- */
    function schedule() {
      clear();
      if (stopped) return;
      const slot = at(index);
      if (slot.dead) { advance(); return; }

      // Look ahead so the next slide is buffered before it is needed.
      let peek = index;
      for (let n = 0; n < ring.length; n++) {
        peek = (peek + 1) % ring.length;
        if (!at(peek).dead) break;
      }
      const upcoming = at(peek);

      if (slot.video) {
        // A clip's own `ended` is the signal. Media duration is not reliable
        // until metadata lands, so arm on a timer derived from it when we can
        // and fall back to arming immediately when we can't.
        const dur = slot.video.duration;
        const lead = (isFinite(dur) && dur > 0)
          ? Math.max(0, (dur - slot.video.currentTime) * 1000 - HERO_ARM_LEAD)
          : 0;
        timer = setTimeout(() => arm(upcoming), lead);
      } else {
        arm(upcoming);
        timer = setTimeout(advance, slot.hold);
      }
    }

    // Clips drive themselves off `ended`. `loop` is removed in markup for
    // exactly this reason — a looping video never fires it.
    ring.forEach((slot) => {
      if (!slot.video) return;
      slot.video.loop = false;
      slot.video.addEventListener('ended', () => {
        if (slot.el.classList.contains('is-current')) advance();
      });
    });

    // A hidden tab should not burn through the rotation. Pause the clock and
    // the current clip; pick both up on return.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { clear(); return; }
      if (stopped) return;
      const slot = at(index);
      if (slot.video && slot.el.classList.contains('is-current')) {
        const p = slot.video.play();
        if (p && p.catch) p.catch(() => {});
      }
      schedule();
    });

    schedule();
  }

  /* --- photo slideshows ----------------------------------------------------
     Any figure marked [data-slideshow] crossfades through its own <img>
     children. Independent of the hero rotator above: that one has to juggle
     clips, buffering and autoplay policy, while this is only ever pictures.

     The timer runs only while the figure is actually on screen and the tab is
     visible, so a slideshow far down the page costs nothing until someone
     scrolls to it.
     ---------------------------------------------------------------------- */

  function initSlideshows() {
    const mq = (q) => (typeof window.matchMedia === 'function' ? window.matchMedia(q).matches : false);
    if (mq('(prefers-reduced-motion: reduce)')) return;   // CSS shows frame one

    $$('[data-slideshow]').forEach((fig) => {
      const frames = Array.prototype.slice.call(fig.querySelectorAll(':scope > img'));
      if (frames.length < 2) return;

      const wait = parseInt(fig.getAttribute('data-interval'), 10) || 4500;
      let index = 0, timer = null, onScreen = true;

      // Only now do the frames all become absolute — before this the first one
      // was holding the box open in normal flow.
      fig.classList.add('is-live');
      frames.forEach((f, i) => f.classList.toggle('is-current', i === 0));

      const stop  = () => { if (timer) { clearInterval(timer); timer = null; } };
      const step  = () => {
        const next = (index + 1) % frames.length;
        // Decode before showing so a frame never fades in half-painted. The
        // catch matters: a missing file must not stall the whole rotation.
        const show = () => {
          frames[index].classList.remove('is-current');
          frames[next].classList.add('is-current');
          index = next;
        };
        if (typeof frames[next].decode === 'function') frames[next].decode().then(show, show);
        else show();
      };
      const start = () => { if (!timer && onScreen) timer = setInterval(step, wait); };

      // A frame that 404s is dropped rather than showing a broken image. If it
      // was the one on screen, something else has to take the baton in the same
      // breath — otherwise nothing carries .is-current and the figure goes
      // blank, which is worse than the broken image we were avoiding.
      frames.forEach((f) => f.addEventListener('error', () => {
        const at = frames.indexOf(f);
        if (at === -1) return;
        const wasCurrent = f.classList.contains('is-current');
        frames.splice(at, 1);
        f.remove();
        if (!frames.length) { stop(); fig.classList.remove('is-live'); return; }
        if (index >= frames.length) index = 0;
        else if (at < index) index--;          // keep pointing at the same frame
        if (wasCurrent) frames[index].classList.add('is-current');
        if (frames.length < 2) stop();         // nothing left to rotate between
      }));

      if (typeof IntersectionObserver === 'function') {
        new IntersectionObserver((entries) => {
          onScreen = entries[0].isIntersecting;
          if (onScreen) start(); else stop();
        }, { rootMargin: '120px' }).observe(fig);
      } else {
        start();
      }

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else start();
      });
    });
  }

  function initHero() {
    const hero  = $('.hero');
    if (!hero) return;
    const stage = $('.hero__stage', hero);
    const inner = $('.hero__inner', hero);
    const video = $('video', hero);
    if (!stage) return;

    // matchMedia is missing in some embedded webviews — fall back rather than
    // throwing, since CSS still enforces the reduced-motion rules either way.
    const mq = (q) => (typeof window.matchMedia === 'function' ? window.matchMedia(q).matches : false);
    const reduced  = mq('(prefers-reduced-motion: reduce)');
    const coarse   = mq('(pointer: coarse)');
    const saveData = navigator.connection && navigator.connection.saveData;

    /* --- video: only load it when it's worth loading --------------------- */
    if (video && !reduced && !saveData) {
      // Reveal on the first decoded frame (loadeddata / readyState 2) rather
      // than waiting for canplay — that's the difference between the clip
      // appearing straight away and the still sitting there for a beat.
      const reveal = () => {
        video.classList.add('is-ready');
        stage.classList.add('is-playing');
      };
      if (video.readyState >= 2) reveal();
      else {
        video.addEventListener('loadeddata', reveal, { once: true });
        video.addEventListener('playing', reveal, { once: true });
      }
      // If the clip dies, put the still back. Without restoring the stage class
      // we'd hide the image and remove the video, leaving an empty hero.
      video.addEventListener('error', () => {
        stage.classList.remove('is-playing');
        video.remove();
      }, { once: true });

      const play = () => {
        if (!video.isConnected) return;
        // WebKit gates inline autoplay on the muted *property*, not just the
        // attribute, and re-checks it on every play() call.
        video.muted = true;
        const p = video.play();
        if (p && p.catch) p.catch(() => { /* blocked — gesture fallback below */ });
      };
      // Don't wait for a load event to try playing; autoplay + preload="auto"
      // usually means it can start well before this script runs.
      play();
      if (video.readyState < 2) video.addEventListener('loadeddata', play, { once: true });

      // iOS blocks autoplay outright in Low Power Mode, and some in-app
      // browsers do too. The first touch anywhere is a user gesture, which
      // lifts the block — so take it and start the clip then.
      const kick = () => { if (video.paused) play(); };
      ['touchstart', 'pointerdown', 'click'].forEach(evt =>
        document.addEventListener(evt, kick, { once: true, passive: true }));

      // Deliberately NOT paused when the hero scrolls out of view. iOS Safari
      // frequently refuses to resume a programmatically paused inline video
      // without a fresh gesture, which stranded the hero on a blank frame
      // after scrolling down and back up. A short muted loop is cheap; the tab
      // being hidden is the only case worth pausing for.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) video.pause(); else play();
      });

      // The rotation owns everything past slide 1.
      initHeroRotation(stage, video, play);
    } else if (video) {
      video.remove();
    }

    if (reduced) return;

    /* --- motion state ---------------------------------------------------- */
    // target = where we want to be, current = where we are. Lerping between
    // the two is what makes the tilt feel weighted instead of twitchy.
    let scrollY   = 0;
    let targetX   = 0, targetY   = 0;   // -1 .. 1 from pointer / gyro
    let currentX  = 0, currentY  = 0;
    let ticking   = false;
    let inView    = true;

    const TILT   = coarse ? 10 : 18;    // px of travel at full deflection
    const EASE   = 0.075;               // lower = heavier
    const DEPTH  = 0.28;                // parallax rate vs scroll

    const onScroll = () => { scrollY = window.scrollY || window.pageYOffset; request(); };

    function onPointer(e) {
      const w = window.innerWidth, h = window.innerHeight;
      targetX = (e.clientX / w) * 2 - 1;
      targetY = (e.clientY / h) * 2 - 1;
      request();
    }

    function onTilt(e) {
      // gamma = left/right (-90..90), beta = front/back (-180..180)
      if (e.gamma == null || e.beta == null) return;
      targetX = Math.max(-1, Math.min(1, e.gamma / 32));
      targetY = Math.max(-1, Math.min(1, (e.beta - 45) / 32));
      request();
    }

    function request() {
      if (!ticking) { ticking = true; requestAnimationFrame(frame); }
    }

    function frame() {
      ticking = false;

      currentX += (targetX - currentX) * EASE;
      currentY += (targetY - currentY) * EASE;

      const h = hero.offsetHeight || 1;
      const progress = Math.min(1, Math.max(0, scrollY / h));

      // Plate drifts down slower than the page and creeps in slightly.
      const drift = scrollY * DEPTH;
      const scale = 1 + progress * 0.08;
      const tiltX = -currentX * TILT;
      const tiltY = -currentY * TILT;

      stage.style.transform =
        `translate3d(${tiltX.toFixed(2)}px, ${(drift + tiltY).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;

      if (inner) {
        // Copy rises faster and fades out before the plate does.
        inner.style.transform = `translate3d(0, ${(scrollY * -0.12).toFixed(2)}px, 0)`;
        inner.style.opacity = String(Math.max(0, 1 - progress * 1.35));
      }

      // Keep animating while the tilt is still settling.
      if (Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001) request();
    }

    // Only listen while the hero is actually on screen.
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (inView) {
        window.addEventListener('scroll', onScroll, { passive: true });
        if (coarse) window.addEventListener('deviceorientation', onTilt, true);
        else window.addEventListener('pointermove', onPointer, { passive: true });
        request();
      } else {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('deviceorientation', onTilt, true);
        window.removeEventListener('pointermove', onPointer);
      }
    }, { threshold: 0 });
    io.observe(hero);

    // Recentre the tilt when the cursor leaves the window.
    document.addEventListener('mouseleave', () => { targetX = 0; targetY = 0; request(); });
    window.addEventListener('resize', request, { passive: true });

    onScroll();
  }

  /* --- shortlist (in-memory only) ----------------------------------------- */

  function toggleSaved(id, btn) {
    if (state.saved.has(id)) { state.saved.delete(id); }
    else { state.saved.add(id); }
    btn.setAttribute('aria-pressed', String(state.saved.has(id)));
    updateSavedCount();
  }

  function updateSavedCount() {
    $$('[data-saved-count]').forEach(el => {
      el.textContent = state.saved.size ? `(${state.saved.size})` : '';
    });
  }

  /* --- property card ------------------------------------------------------ */

  function statusTag(p) {
    if (p.status === 'Under Contract') return '<span class="tag tag--contract">Under Contract</span>';
    if (p.status === 'Sold') return '<span class="tag tag--sold">Sold</span>';
    return '<span class="tag">For Sale</span>';
  }

  function propertyCard(p) {
    // Always points at the listings page + hash. From index.html that's a
    // normal navigation; from properties.html it's a fragment change that
    // opens the detail overlay without a reload.
    const href = `properties.html#${encodeURIComponent(p.id)}`;
    return `
      <article class="pcard reveal">
        <div class="pcard__media">
          <a href="${href}" aria-label="${esc(p.title)}">
            <img src="${esc(p.images[0])}" alt="${esc(p.title)}, ${esc(p.county)}" loading="lazy" decoding="async">
          </a>
          <div class="pcard__tags">
            ${statusTag(p)}
            ${p.featured ? '<span class="tag tag--gold">Featured</span>' : ''}
          </div>
          <button class="pcard__save" type="button" aria-pressed="${state.saved.has(p.id)}"
                  aria-label="Save ${esc(p.title)}" data-save="${esc(p.id)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"/></svg>
          </button>
          <div class="pcard__price">${esc(p.priceLabel)}</div>
        </div>
        <div class="pcard__body">
          <h3 class="pcard__title"><a href="${href}">${esc(p.title)}</a></h3>
          <p class="pcard__loc">${esc(p.locationLabel)}</p>
          <div class="pcard__meta">
            <span>Acreage<b>${acresFmt(p.acres)}±</b></span>
            <span>Type<b>${esc(p.types.slice(0, 2).join(', '))}</b></span>
          </div>
        </div>
      </article>`;
  }

  function bindCardActions(root = document) {
    $$('[data-save]', root).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleSaved(btn.dataset.save, btn);
      });
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.06 });
    $$('.reveal:not(.is-in)', root).forEach(el => io.observe(el));
  }

  /* --- home page ---------------------------------------------------------- */

  async function initHome() {
    const props = await getProperties();

    // Featured grid. Eight tracts, all on the page at once — the carousel it
    // replaced hid five of them behind an arrow most readers never pressed.
    // Featured listings come first; if fewer than eight are flagged, the
    // newest unflagged tracts backfill so the grid never renders short.
    const FEATURED_COUNT = 8;
    const live = props.filter(p => p.status !== 'Sold');
    const byNewest = (a, b) => new Date(b.listed) - new Date(a.listed);
    const flagged = live.filter(p => p.featured).sort(byNewest);
    const backfill = live.filter(p => !p.featured).sort(byNewest);
    const featured = [...flagged, ...backfill].slice(0, FEATURED_COUNT);

    const track = $('[data-featured]');
    if (track) {
      track.innerHTML = featured.map(propertyCard).join('');
      bindCardActions(track);
    }

    // The button under the grid names how many tracts are waiting on the other
    // side of it. That number is the reason to press it, so it is read from the
    // live data rather than typed into the markup — the fallback in the HTML is
    // only what shows if this script never runs.
    const allCount = $('[data-all-count]');
    if (allCount) allCount.textContent = live.length;

    // The land map that replaced the category tiles.
    initLandMap(props);

  }

  const setText = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };

  /* --- home land map -------------------------------------------------------
     Sits where the five category tiles used to be. The legend is not
     decoration: each chip is a real toggle, so the colour key and the filter
     are the same control and a reader can never be looking at a colour they
     have no name for. A tract carries more than one type, so it shows while
     ANY of its types is on, and takes the colour of the first one that is.
     -------------------------------------------------------------------------- */

  const LAND_TYPES = [
    { key: 'Timber',       label: 'Timberland',   color: '#22362A' },
    // Recreational was clay, which is the site's accent and read as a warning
    // beside the new red. A mid green separates cleanly from Timber's near
    // black pine by lightness, not hue.
    { key: 'Recreational', label: 'Recreational', color: '#5E8C3C' },
    { key: 'Homesite',     label: 'Homesites',    color: '#B98A3C' },
    { key: 'Investment',   label: 'Investment',   color: '#3E5C6B' }
  ];

  /* Managed locations are not listings. They are places where Nichols has
     managed assets, and they exist on the map to show how far the work
     reaches — several states past the tracts currently for sale. They carry
     no acreage, price or detail page, so they are a separate layer with its
     own switch rather than another land type.

     Off by default: switching them on pulls the map out to a multi-state view,
     which is the wrong first impression for someone looking for land to buy. */
  // Bright red: sold pins have to be legible as a different kind of thing from
  // every land type at a glance. Kept in step with --sold in style.css.
  const ALL_TYPE_KEYS = new Set(LAND_TYPES.map(t => t.key));
  const SOLD_COLOR = '#D42A1E';
  const MANAGED_COLOR = '#8A6BAF';
  const MANAGED_LOCATIONS = [
    { label: 'Knoxville, TN',     lat: 35.9606, lng: -83.9207 },
    { label: 'Greenwood, SC',     lat: 34.1954, lng: -82.1618 },
    { label: 'Richmond Hill, GA', lat: 31.9382, lng: -81.3037 },
    { label: 'Fargo, GA',         lat: 30.6816, lng: -82.5651 },
    { label: 'Lake City, FL',     lat: 30.1897, lng: -82.6393 },
    { label: 'Eufaula, AL',       lat: 31.8913, lng: -85.1455 },
    { label: 'Jackson, AL',       lat: 31.5093, lng: -87.8944 }
  ];

  /* --- shared map legend ---------------------------------------------------
     Both maps — the one on the home page and the one behind the listings
     page's Map view — offer the same switches, so they share one
     implementation rather than two that drift apart. This owns the chip
     markup, the on/off state and the guard that stops the map going blank;
     each map supplies its own counts and its own draw().

     Returns state() rather than exposing the sets directly, so a caller can
     read the current filter but cannot quietly mutate it behind the chips.
     ---------------------------------------------------------------------- */

  function createMapFilters(legend, { typeCounts = {}, soldCount = 0, managedCount = 0, onChange }) {
    const active = new Set(LAND_TYPES.map(t => t.key));
    let showSold = false;
    let showManaged = false;

    legend.innerHTML = LAND_TYPES.map(t => `
      <button class="legend-chip" type="button" data-legend-type="${t.key}" aria-pressed="true">
        <span class="legend-chip__dot" style="background:${t.color}"></span>
        <span class="legend-chip__label">${t.label}</span>
        <span class="legend-chip__count">${typeCounts[t.key] || 0}</span>
      </button>`).join('') +
      (soldCount ? `
      <button class="legend-chip legend-chip--sold" type="button" data-legend-sold aria-pressed="false">
        <span class="legend-chip__dot" style="background:${SOLD_COLOR}"></span>
        <span class="legend-chip__label">Sold</span>
        <span class="legend-chip__count">${soldCount}</span>
      </button>` : '') +
      (managedCount ? `
      <button class="legend-chip legend-chip--managed" type="button" data-legend-managed aria-pressed="false">
        <span class="legend-chip__dot" style="background:${MANAGED_COLOR}"></span>
        <span class="legend-chip__label">Management</span>
        <span class="legend-chip__count">${managedCount}</span>
      </button>` : '') +
      `<span class="legend-note" data-legend-note></span>`;

    const soldBtn    = $('[data-legend-sold]', legend);
    const managedBtn = $('[data-legend-managed]', legend);

    // Keep every chip's pressed state in step with the sets that drive draw().
    const syncChips = () => {
      $$('[data-legend-type]', legend).forEach(b =>
        b.setAttribute('aria-pressed', String(active.has(b.dataset.legendType))));
      if (soldBtn)    soldBtn.setAttribute('aria-pressed', String(showSold));
      if (managedBtn) managedBtn.setAttribute('aria-pressed', String(showManaged));
    };

    // The map must never end up completely blank. "Blank" means no land types
    // AND no sold layer AND no managed layer — not merely no land types, which
    // is what an earlier version checked. That older test made "sold only" and
    // "managed only" impossible: switching off the last land type silently
    // turned all four back on, throwing away the filter the reader had just
    // built up chip by chip.
    const somethingLeft = () => active.size > 0 || showSold || showManaged;
    const restoreAllTypes = () => LAND_TYPES.forEach(t => active.add(t.key));
    const settle = () => {
      if (!somethingLeft()) restoreAllTypes();
      syncChips();
      onChange();
    };

    $$('[data-legend-type]', legend).forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.legendType;
        if (active.has(key)) active.delete(key); else active.add(key);
        settle();
      });
    });
    if (soldBtn)    soldBtn.addEventListener('click',    () => { showSold = !showSold; settle(); });
    if (managedBtn) managedBtn.addEventListener('click', () => { showManaged = !showManaged; settle(); });

    return {
      note: $('[data-legend-note]', legend),
      state: () => ({ active, showSold, showManaged })
    };
  }

  function initLandMap(props) {
    const canvas = $('[data-land-map]');
    const legend = $('[data-map-legend]');
    if (!canvas || !legend) return;

    const mapped   = props.filter(p => p.lat != null && p.lng != null);
    const listings = mapped.filter(p => p.status !== 'Sold');
    // Sold tracts are the track record, not the inventory. They ride on the
    // same map behind their own switch, off by default, so the first thing a
    // buyer sees is still what they can actually buy.
    const soldList = mapped.filter(p => p.status === 'Sold');

    // No mapping library (blocked, offline, CDN down) — say so and offer the
    // listings page rather than leaving a grey rectangle on the front page.
    if (!window.L || !listings.length) {
      const section = canvas.closest('section');
      if (section) {
        section.querySelector('.landmap').innerHTML =
          `<div class="empty-state" style="padding:56px 24px">
             <p class="h3" style="margin-bottom:8px">The map couldn't load.</p>
             <p><a class="link-arrow" href="properties.html">Browse the listings instead →</a></p>
           </div>`;
      }
      return;
    }

    // A tract is usually two or three types at once, so the pin takes the
    // colour of its own first-listed type — the primary one. Filter down to a
    // single type and every visible pin recolours to that type, so the legend
    // and the map always agree about what a colour means.
    // Takes the active set as an argument rather than closing over it: the
    // filter state now lives in createMapFilters, and reaching for a stale
    // outer binding here is exactly how this broke once already.
    const colorFor = (p, activeSet) => {
      const on = p.types.filter(t => activeSet.has(t));
      const key = (on.length ? on : p.types)[0];
      return (LAND_TYPES.find(t => t.key === key) || LAND_TYPES[0]).color;
    };

    const pin = (color) => L.divIcon({
      className: '',
      html: `<span style="display:block;width:22px;height:22px;border-radius:50%;
             background:${color};border:2px solid #F2F4EF;
             box-shadow:0 2px 8px rgba(22,26,21,.4)"></span>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    let map;
    try {
      map = L.map(canvas, { scrollWheelZoom: false, zoomControl: true })
             .setView([33.75, -83.1], 8);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 18
      }).addTo(map);
    } catch (err) {
      console.error('[NLI] land map failed to build', err);
      return;
    }

    const markers = listings.map(p => {
      const m = L.marker([p.lat, p.lng], { icon: pin(colorFor(p, ALL_TYPE_KEYS)), title: p.title });
      m.bindPopup(`
        <div class="map-pop">
          <img src="${esc(p.images[0])}" alt="${esc(p.title)}">
          <div class="map-pop__body">
            <h4>${esc(p.title)}</h4>
            <p>${acresFmt(p.acres)} acres · ${esc(p.county)}</p>
            <p style="font-weight:600;color:#1F3527">${esc(p.priceLabel)}</p>
            <a class="btn btn--primary btn--sm" href="properties.html#${encodeURIComponent(p.id)}">View Details</a>
          </div>
        </div>`);
      return { p, m };
    });

    const soldMarkers = soldList.map(p => {
      const m = L.marker([p.lat, p.lng], { icon: pin(SOLD_COLOR), title: p.title + ' (sold)' });
      m.bindPopup(`
        <div class="map-pop">
          ${p.images[0] ? `<img src="${esc(p.images[0])}" alt="${esc(p.title)}">` : ''}
          <div class="map-pop__body">
            <h4>${esc(p.title)}</h4>
            <p>${acresFmt(p.acres)} acres · ${esc(p.county)}</p>
            <p style="font-weight:600;color:#D42A1E">Sold${p.listed ? ' · ' + p.listed.slice(0, 4) : ''}</p>
          </div>
        </div>`);
      return { p, m };
    });

    const managedMarkers = MANAGED_LOCATIONS.map(loc => {
      const m = L.marker([loc.lat, loc.lng], { icon: pin(MANAGED_COLOR), title: loc.label + ' (managed)' });
      m.bindPopup(`
        <div class="map-pop map-pop--plain">
          <div class="map-pop__body">
            <h4>${esc(loc.label)}</h4>
            <p style="font-weight:600;color:${MANAGED_COLOR}">Asset under management</p>
          </div>
        </div>`);
      return { p: loc, m };
    });

    const managedCount = MANAGED_LOCATIONS.length;
    const filters = createMapFilters(legend, {
      typeCounts: Object.fromEntries(LAND_TYPES.map(t =>
        [t.key, listings.filter(p => p.types.includes(t.key)).length])),
      soldCount: soldList.length,
      managedCount,
      onChange: () => draw()
    });
    const note = filters.note;

    function draw() {
      const { active, showSold, showManaged } = filters.state();
      const shown = [];
      let forSaleShown = 0;
      markers.forEach(({ p, m }) => {
        const on = p.types.some(t => active.has(t));
        if (on) { m.setIcon(pin(colorFor(p, active))); m.addTo(map); shown.push(p); forSaleShown++; }
        else { map.removeLayer(m); }
      });
      soldMarkers.forEach(({ p, m }) => {
        if (showSold) { m.addTo(map); shown.push(p); }
        else { map.removeLayer(m); }
      });
      managedMarkers.forEach(({ p, m }) => {
        if (showManaged) { m.addTo(map); shown.push(p); }
        else { map.removeLayer(m); }
      });
      if (shown.length) {
        // maxZoom only bites when the pins are tightly clustered; the managed
        // layer spans four states, so fitBounds pulls right out on its own.
        map.fitBounds(shown.map(p => [p.lat, p.lng]), { padding: [45, 45], maxZoom: 11 });
      }
      // Counted as it goes rather than derived by subtraction — with three
      // independent layers, inferring one total from another is how the
      // number quietly goes wrong.
      const parts = [
        forSaleShown === listings.length
          ? `${listings.length} tracts`
          : `${forSaleShown} of ${listings.length} tracts`
      ];
      if (showSold)    parts.push(`${soldList.length} sold`);
      if (showManaged) parts.push(`${managedCount} managed`);
      note.textContent = parts.join(' · ');
    }

    draw();
    // The section can be laid out before the tiles have anywhere to sit.
    setTimeout(() => map.invalidateSize(), 120);
  }

  /* --- properties listing page -------------------------------------------- */

  async function initProperties() {
    const props = await getProperties();

    // The filter controls are gone for now — every active listing shows,
    // newest first. The lookups stay optional-chained so the controls can be
    // dropped back in later without touching this function.
    const els = {
      type:   $('[name="type"]'),
      county: $('[name="county"]'),
      min:    $('[name="min"]'),
      max:    $('[name="max"]'),
      acres:  $('[name="acres"]'),
      sort:   $('[name="sort"]'),
      grid:   $('[data-results]'),
      count:  $('[data-count]')
    };

    function apply() {
      let out = props.filter(p => p.status !== 'Sold');
      const type = els.type?.value, county = els.county?.value;
      const min = Number(els.min?.value || 0), max = Number(els.max?.value || 0);
      const acres = els.acres?.value || '';

      if (type)   out = out.filter(p => p.types.includes(type));
      if (county) out = out.filter(p => p.county === county);
      if (min)    out = out.filter(p => p.price == null || p.price >= min);
      if (max)    out = out.filter(p => p.price == null || p.price <= max);
      if (acres) {
        const [lo, hi] = acres.split('-').map(Number);
        out = out.filter(p => p.acres >= lo && (hi ? p.acres <= hi : true));
      }

      const sort = els.sort?.value || 'newest';
      const rank = { newest: (a, b) => new Date(b.listed) - new Date(a.listed),
                     'price-asc':  (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
                     'price-desc': (a, b) => (b.price ?? -1) - (a.price ?? -1),
                     'acres-desc': (a, b) => b.acres - a.acres,
                     'acres-asc':  (a, b) => a.acres - b.acres };
      out.sort(rank[sort] || rank.newest);

      if (els.count) els.count.innerHTML = `<b>${out.length}</b> ${out.length === 1 ? 'property' : 'properties'}`;
      els.grid.innerHTML = out.length
        ? out.map(propertyCard).join('')
        : `<div class="empty-state" style="grid-column:1/-1">
             <p class="h3" style="margin-bottom:8px">No properties listed right now.</p>
             <p>New tracts come up regularly — <a class="link-arrow" href="index.html#contact">tell us what you're looking for</a> and we'll be in touch.</p>
           </div>`;
      bindCardActions(els.grid);

      // Grid and map read from the same filtered set.
      visible = out;
      syncMap(out);
    }

    ['type', 'county', 'min', 'max', 'acres', 'sort'].forEach(k => {
      els[k]?.addEventListener('change', apply);
    });
    $('[data-reset]')?.addEventListener('click', () => {
      ['type', 'county', 'min', 'max', 'acres'].forEach(k => { if (els[k]) els[k].value = ''; });
      if (els.sort) els.sort.value = 'newest';
      apply();
    });

    /* --- grid / map toggle ------------------------------------------------ */

    let visible = [];
    let map = null, markers = {}, mapReady = false;
    // Sold and managed pins live outside `markers`, which is keyed by listing
    // id and used for the side-list hover wiring.
    let extraMarkers = [];
    let mapFilters = null;

    const gridEl = els.grid;
    const mapWrap = $('[data-map-view]');
    const listEl = $('[data-map-list]');
    const legendEl = $('[data-map-legend]');

    // Sold tracts are excluded from the grid, so the map layer reads them from
    // the full set rather than from what the page is currently listing.
    const soldList = props.filter(p => p.status === 'Sold' && p.lat != null && p.lng != null);

    // Colour matches the home map's key, so a hue means the same thing on both.
    // `active` is the hover/selected state, which grows the pin and switches it
    // to the gold accent rather than changing what the colour means.
    const pin = (isActive, color) => L.divIcon({
      className: '',
      html: `<div style="width:${isActive ? 32 : 24}px;height:${isActive ? 32 : 24}px;border-radius:50%;
             background:${isActive ? '#B98A3C' : (color || '#1F3527')};border:2px solid #F7F4EC;
             box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
      iconSize: [isActive ? 32 : 24, isActive ? 32 : 24],
      iconAnchor: [isActive ? 16 : 12, isActive ? 16 : 12]
    });

    // Same rule as the home map: a tract carries several types, so the pin
    // takes its first type that is currently switched on.
    const colorFor = (p, activeSet) => {
      const on = p.types.filter(t => activeSet.has(t));
      const key = (on.length ? on : p.types)[0];
      return (LAND_TYPES.find(t => t.key === key) || LAND_TYPES[0]).color;
    };

    function ensureMap() {
      if (mapReady || !window.L || !$('#map')) return;
      try {
        map = L.map('map', { zoomControl: true }).setView([33.75, -83.1], 8);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors', maxZoom: 18
        }).addTo(map);
        mapReady = true;
      } catch (err) {
        console.error('[NLI] listings map failed to build', err);
        mapReady = false;
      }
    }

    // If the mapping library never arrived, there's nothing to switch to.
    // Hide the toggle rather than offer a button that opens an empty box.
    if (!window.L) {
      $$('[data-view]').forEach(b => b.remove());
      $('.viewtoggle')?.remove();
      // The toggle is the only thing left in the bar now that the filter and
      // sort controls are gone — an empty rule above the grid is just noise.
      $('.results-bar')?.remove();
    }

    /* The legend narrows whatever the page filters already produced. Two
       stages, deliberately: `visible` is the grid's set, and the chips filter
       that down again, so grid and map never disagree about what is listed —
       the map just shows fewer pins.

       Sold and managed are layers of their own, drawn from the full data
       rather than from `visible`, exactly as on the home page. */
    function syncMap(list) {
      if (!mapReady) return;
      const { active, showSold, showManaged } = mapFilters
        ? mapFilters.state()
        : { active: new Set(LAND_TYPES.map(t => t.key)), showSold: false, showManaged: false };

      Object.values(markers).forEach(m => map.removeLayer(m));
      markers = {};
      extraMarkers.forEach(m => map.removeLayer(m));
      extraMarkers = [];

      const shown = list.filter(p => p.types.some(t => active.has(t)));

      shown.forEach(p => {
        const m = L.marker([p.lat, p.lng], { icon: pin(false, colorFor(p, active)), title: p.title }).addTo(map);
        m.bindPopup(`
          <div class="map-pop">
            <img src="${esc(p.images[0])}" alt="${esc(p.title)}">
            <div class="map-pop__body">
              <h4>${esc(p.title)}</h4>
              <p>${acresFmt(p.acres)} acres · ${esc(p.county)}</p>
              <p style="font-weight:600;color:#1F3527">${esc(p.priceLabel)}</p>
              <a class="btn btn--primary btn--sm" href="#${encodeURIComponent(p.id)}">View Details</a>
            </div>
          </div>`);
        markers[p.id] = m;
      });

      const bounds = shown.map(p => [p.lat, p.lng]);

      if (showSold) {
        soldList.forEach(p => {
          const m = L.marker([p.lat, p.lng], { icon: pin(false, SOLD_COLOR), title: p.title + ' (sold)' }).addTo(map);
          m.bindPopup(`
            <div class="map-pop${p.images[0] ? '' : ' map-pop--plain'}">
              ${p.images[0] ? `<img src="${esc(p.images[0])}" alt="${esc(p.title)}">` : ''}
              <div class="map-pop__body">
                <h4>${esc(p.title)}</h4>
                <p>${acresFmt(p.acres)} acres · ${esc(p.county)}</p>
                <p style="font-weight:600;color:${SOLD_COLOR}">Sold${p.listed ? ' · ' + p.listed.slice(0, 4) : ''}</p>
              </div>
            </div>`);
          extraMarkers.push(m);
          bounds.push([p.lat, p.lng]);
        });
      }

      if (showManaged) {
        MANAGED_LOCATIONS.forEach(loc => {
          const m = L.marker([loc.lat, loc.lng], { icon: pin(false, MANAGED_COLOR), title: loc.label + ' (managed)' }).addTo(map);
          m.bindPopup(`
            <div class="map-pop map-pop--plain">
              <div class="map-pop__body">
                <h4>${esc(loc.label)}</h4>
                <p style="font-weight:600;color:${MANAGED_COLOR}">Asset under management</p>
              </div>
            </div>`);
          extraMarkers.push(m);
          bounds.push([loc.lat, loc.lng]);
        });
      }

      if (bounds.length) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });

      if (mapFilters) {
        const parts = [shown.length === list.length
          ? `${list.length} ${list.length === 1 ? 'tract' : 'tracts'}`
          : `${shown.length} of ${list.length} tracts`];
        if (showSold)    parts.push(`${soldList.length} sold`);
        if (showManaged) parts.push(`${MANAGED_LOCATIONS.length} managed`);
        mapFilters.note.textContent = parts.join(' · ');
      }

      // The side list follows the pins: showing a card for a tract whose pin
      // has been filtered off would be its own small lie.
      listEl.innerHTML = shown.length
        ? shown.map(p => `
          <button class="mcard" type="button" data-map-card="${esc(p.id)}">
            <img src="${esc(p.images[0])}" alt="${esc(p.title)}" loading="lazy">
            <div>
              <h4>${esc(p.title)}</h4>
              <p>${acresFmt(p.acres)} acres · ${esc(p.county)}</p>
              <div class="price">${esc(p.priceLabel)}</div>
            </div>
          </button>`).join('')
        : `<p class="muted" style="padding:20px">No properties match those filters.</p>`;

      $$('[data-map-card]', listEl).forEach(card => {
        const id = card.dataset.mapCard;
        const base = () => colorFor(shown.find(x => x.id === id), active);
        card.addEventListener('click', () => {
          const p = shown.find(x => x.id === id);
          map.flyTo([p.lat, p.lng], 13, { duration: .8 });
          markers[id].openPopup();
          $$('.mcard', listEl).forEach(c => c.classList.remove('is-active'));
          card.classList.add('is-active');
        });
        card.addEventListener('mouseenter', () => markers[id]?.setIcon(pin(true, base())));
        card.addEventListener('mouseleave', () => markers[id]?.setIcon(pin(false, base())));
      });
    }

    function setView(mode, push = true) {
      const isMap = mode === 'map';
      gridEl.hidden = isMap;
      mapWrap.hidden = !isMap;
      $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === mode)));

      if (isMap) {
        ensureMap();
        // Built on first open rather than at boot: the legend's counts come
        // from the listings the page is actually showing, and the map view
        // may never be opened at all.
        if (mapReady && legendEl && !mapFilters) {
          mapFilters = createMapFilters(legendEl, {
            typeCounts: Object.fromEntries(LAND_TYPES.map(t =>
              [t.key, visible.filter(p => p.types.includes(t.key)).length])),
            soldCount: soldList.length,
            managedCount: MANAGED_LOCATIONS.length,
            onChange: () => syncMap(visible)
          });
        }
        if (!mapReady) {
          // Say what happened rather than showing an empty rectangle.
          mapWrap.innerHTML = `<div class="empty-state" style="padding:60px 24px">
            <p class="h3" style="margin-bottom:8px">The map couldn't load.</p>
            <p>Switch back to grid view to browse the tracts, or
            <a class="link-arrow" href="index.html#contact">tell us what you're looking for</a>.</p></div>`;
          return;
        }
        syncMap(visible);
        // Leaflet needs a nudge after being un-hidden or tiles render grey.
        if (map) setTimeout(() => map.invalidateSize(), 60);
      }

      if (push) {
        const url = new URL(window.location);
        if (isMap) url.searchParams.set('view', 'map');
        else url.searchParams.delete('view');
        history.replaceState(null, '', url);
      }
    }

    $$('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.dataset.view));
    });

    apply();
    setView(new URLSearchParams(window.location.search).get('view') === 'map' ? 'map' : 'grid', false);

    /* --- detail overlay, driven by the URL hash --------------------------- */

    initDetailOverlay(props);
  }

  /* --- property detail overlay --------------------------------------------
     The panel is a dialog over the listings page. State lives entirely in the
     URL hash, so a listing is still a shareable link and Back closes it.
     ------------------------------------------------------------------------ */

  function initDetailOverlay(props) {
    const overlay = $('[data-detail]');
    if (!overlay) return;

    const baseTitle = document.title;
    let detailMap = null;
    let lastFocused = null;

    const idFromHash = () => decodeURIComponent((window.location.hash || '').replace(/^#/, ''));

    function open(p) {
      renderDetail(p, () => { detailMap = null; });
      lastFocused = document.activeElement;

      overlay.hidden = false;
      // Next frame so the transition actually runs.
      requestAnimationFrame(() => overlay.classList.add('is-open'));
      document.body.classList.add('has-overlay');
      document.title = `${p.title} — ${p.acresLabel}, ${p.county} | Nichols Land & Investment Co.`;

      overlay.querySelector('.detail__panel').scrollTop = 0;
      $('.detail__close', overlay)?.focus();

      // Detail mini-map has to be built after the panel is visible.
      if (window.L && $('#detail-map')) {
        $('#detail-map').innerHTML = '';
        detailMap = L.map('detail-map', { scrollWheelZoom: false, zoomControl: true })
          .setView([p.lat, p.lng], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors', maxZoom: 18
        }).addTo(detailMap);
        L.marker([p.lat, p.lng]).addTo(detailMap);
        setTimeout(() => detailMap && detailMap.invalidateSize(), 80);
      }
    }

    function close() {
      overlay.classList.remove('is-open');
      document.body.classList.remove('has-overlay');
      document.title = baseTitle;
      if (detailMap) { detailMap.remove(); detailMap = null; }
      setTimeout(() => { overlay.hidden = true; }, 280);
      lastFocused && lastFocused.focus && lastFocused.focus();
    }

    function sync() {
      const id = idFromHash();
      const p = id && props.find(x => x.id === id);
      if (p) open(p);
      else if (!overlay.hidden) close();
    }

    // Closing clears the hash, which re-triggers sync() — that's the single
    // source of truth rather than tracking open/closed separately.
    $$('[data-detail-close]', overlay).forEach(b => b.addEventListener('click', () => {
      history.pushState(null, '', window.location.pathname + window.location.search);
      close();
    }));

    document.addEventListener('keydown', (e) => {
      if (overlay.hidden) return;
      if (e.key === 'Escape' && !$('.lightbox')?.classList.contains('is-open')) {
        history.pushState(null, '', window.location.pathname + window.location.search);
        close();
      }
      // Keep tab focus inside the panel while it's open.
      if (e.key === 'Tab') {
        const f = $$('a[href], button, input, select, textarea', overlay)
          .filter(el => el.offsetParent !== null || el === document.activeElement);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    window.addEventListener('hashchange', sync);
    sync();
  }

  function renderDetail(p) {
    $('[data-hero-img]').src = p.images[0];
    $('[data-hero-img]').alt = `${p.title}, ${p.county}`;
    setText('[data-title]', p.title);
    setText('[data-loc]', p.locationLabel);

    $('[data-tags]').innerHTML = statusTag(p) + (p.featured ? '<span class="tag tag--gold">Featured</span>' : '');

    $('[data-facts]').innerHTML = `
      <div class="fact"><span>Price</span><b>${esc(p.priceLabel)}</b></div>
      <div class="fact"><span>Acreage</span><b>${acresFmt(p.acres)}</b></div>
      <div class="fact"><span>County</span><b>${esc(p.county.replace(' County', ''))}</b></div>
      <div class="fact"><span>Land Type</span><b style="font-size:1rem">${esc(p.types.join(', '))}</b></div>
      <div class="fact"><span>Status</span><b style="font-size:1rem">${esc(p.status)}</b></div>`;

    setText('[data-summary]', p.summary);
    $('[data-bullets]').innerHTML = p.bullets.map(b => `<li>${esc(b)}</li>`).join('');

    const dirWrap = $('[data-directions-wrap]');
    if (p.directions) { $('[data-directions]').textContent = p.directions; }
    else { dirWrap.style.display = 'none'; }

    const docWrap = $('[data-docs-wrap]');
    if (p.docs.length) {
      $('[data-docs]').innerHTML = p.docs.map(d =>
        `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label)}<span>Open ↗</span></a>`).join('');
    } else { docWrap.style.display = 'none'; }

    // Gallery
    $('[data-gallery]').innerHTML = p.images.map((src, i) =>
      `<button type="button" data-lb="${i}"><img src="${esc(src)}" alt="${esc(p.title)} photo ${i + 1}" loading="lazy"></button>`
    ).join('');
    initLightbox(p.images);

    // Similar properties — these link by hash, so they swap the panel in place.
    const similar = state.properties
      .filter(x => x.id !== p.id && x.status !== 'Sold' && x.types.some(t => p.types.includes(t)))
      .slice(0, 3);
    const simWrap = $('[data-similar]');
    if (simWrap) {
      simWrap.innerHTML = similar.map(propertyCard).join('');
      bindCardActions(simWrap);
    }
  }

  /* --- lightbox ----------------------------------------------------------- */

  function initLightbox(images) {
    const box = $('.lightbox');
    if (!box) return;
    let idx = 0;
    const img = $('.lightbox img', box);
    const count = $('.lightbox__count', box);

    const show = (i) => {
      idx = (i + images.length) % images.length;
      img.src = images[idx];
      count.textContent = `${idx + 1} / ${images.length}`;
    };
    const open = (i) => { show(i); box.classList.add('is-open'); document.body.style.overflow = 'hidden'; };
    const close = () => { box.classList.remove('is-open'); document.body.style.overflow = ''; };

    $$('[data-lb]').forEach(b => b.addEventListener('click', () => open(Number(b.dataset.lb))));
    $('.lightbox__close', box).addEventListener('click', close);
    $('.lightbox__prev', box).addEventListener('click', () => show(idx - 1));
    $('.lightbox__next', box).addEventListener('click', () => show(idx + 1));
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    document.addEventListener('keydown', (e) => {
      if (!box.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'ArrowRight') show(idx + 1);
    });
  }

  /* --- county of interest select -------------------------------------------
     All 159 Georgia counties. The handful we currently have listings in are
     grouped at the top, since those are what most enquiries are about.
     ------------------------------------------------------------------------ */

  async function initCountySelect() {
    const sel = $('[data-county-select]');
    if (!sel) return;

    let counties;
    try {
      counties = await loadJSON(ROOT + 'data/ga-counties.json');
    } catch (err) {
      console.error('[NLI] ga-counties.json failed to load', err);
      return;
    }

    // Counties we actually have inventory in, if the listings have loaded.
    let active = [];
    try {
      const props = await getProperties();
      active = [...new Set(props
        .filter(p => p.status !== 'Sold')
        .map(p => p.county.replace(/ County$/, '')))]
        .filter(c => counties.includes(c))
        .sort();
    } catch { /* listings are optional here — fall through to the full list */ }

    const opt = (c) => `<option value="${esc(c)} County">${esc(c)} County</option>`;

    sel.innerHTML =
      `<option value="">Select a county</option>` +
      (active.length
        ? `<optgroup label="Counties with current listings">${active.map(opt).join('')}</optgroup>`
        : '') +
      `<optgroup label="All Georgia counties">${counties.map(opt).join('')}</optgroup>` +
      `<option value="Other / Not sure">Other / Not sure</option>`;

    // Honour a ?county= prefill coming from a listing enquiry.
    const pre = new URLSearchParams(window.location.search).get('county');
    if (pre) sel.value = pre;
  }

  /* --- multi-select dropdown ----------------------------------------------
     Turns a [data-multiselect] block into a dropdown of checkboxes: pick as
     many as apply, the closed control summarises the choice.

     Deliberately not a <select multiple> — that needs ctrl/cmd-click to take
     a second option, which most people never discover, and it renders as a
     tall scrolling box that breaks the form's grid.
     ---------------------------------------------------------------------- */

  function initMultiSelects() {
    $$('[data-multiselect]').forEach((root) => {
      const toggle  = $('.multiselect__toggle', root);
      const panel   = $('[data-multiselect-panel]', root);
      const summary = $('[data-multiselect-summary]', root);
      if (!toggle || !panel || !summary) return;

      const boxes = $$('input[type="checkbox"]', panel);
      const placeholder = root.getAttribute('data-placeholder') || 'Select…';

      // "Buying Land", then "Buying Land +2" — the first choice stays readable
      // instead of collapsing to a bare count the moment a second is added.
      const render = () => {
        const on = boxes.filter(b => b.checked);
        summary.textContent = on.length === 0
          ? placeholder
          : (on.length === 1 ? on[0].value : `${on[0].value}  +${on.length - 1}`);
        summary.setAttribute('data-empty', String(on.length === 0));
        // Clear the error the moment the reader satisfies it, rather than
        // making them submit again to find out they fixed it.
        if (on.length) root.closest('.field')?.classList.remove('is-invalid');
      };

      const open = () => {
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
      };
      const close = () => {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      };

      toggle.addEventListener('click', () => {
        panel.hidden ? open() : close();
      });

      boxes.forEach(b => b.addEventListener('change', render));

      // Escape closes and returns focus to the control, which is where the
      // reader expects to be after backing out.
      root.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !panel.hidden) {
          e.stopPropagation();
          close();
          toggle.focus();
        }
      });

      // Clicking anywhere else closes it. Checked on pointerdown so the panel
      // is gone before a click lands on whatever is underneath.
      document.addEventListener('pointerdown', (e) => {
        if (!panel.hidden && !root.contains(e.target)) close();
      });

      // Tabbing past the last checkbox should close it too, or the panel is
      // left hanging open over the fields below.
      root.addEventListener('focusout', () => {
        setTimeout(() => {
          if (!panel.hidden && !root.contains(document.activeElement)) close();
        }, 0);
      });

      // Expose a tiny API so the form can validate and prefill without
      // reaching into the markup itself.
      root._multiselect = {
        boxes,
        selected: () => boxes.filter(b => b.checked).map(b => b.value),
        check: (value) => {
          const hit = boxes.find(b => b.value === value);
          if (hit) { hit.checked = true; render(); }
        },
        render
      };

      render();
    });
  }

  /* --- contact form ------------------------------------------------------- */

  function initForm() {
    const form = $('[data-contact-form]');
    if (!form) return;

    // Prefill property from ?property=
    const prop = new URLSearchParams(window.location.search).get('property');
    const msg = $('[name="message"]', form);
    if (prop && msg && !msg.value) {
      msg.value = `I'd like more information about ${prop}.`;
      const subj = $('[data-multiselect]', form);
      if (subj && subj._multiselect) subj._multiselect.check('Farms & Land');
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let ok = true;

      $$('[required]', form).forEach(input => {
        const field = input.closest('.field') || input.closest('.check');
        const valid = input.type === 'checkbox' ? input.checked : input.value.trim() !== '';
        const emailOk = input.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
        if (!valid || !emailOk) { ok = false; field?.classList.add('is-invalid'); }
        else { field?.classList.remove('is-invalid'); }
      });

      // A required multi-select needs at least one box ticked. It can't ride
      // on [required] above: that attribute on a checkbox means *this* one
      // must be checked, which would demand all eight.
      $$('[data-multiselect-required]', form).forEach(root => {
        const field = root.closest('.field');
        const chosen = root._multiselect ? root._multiselect.selected().length : 0;
        if (!chosen) { ok = false; field?.classList.add('is-invalid'); }
        else { field?.classList.remove('is-invalid'); }
      });

      if (!ok) {
        $('.is-invalid input, .is-invalid select, .is-invalid textarea, .is-invalid .multiselect__toggle')?.focus();
        return;
      }

      // Built by hand rather than Object.fromEntries: that keeps only the LAST
      // value for a repeated name, so every subject but one would be dropped.
      const fd = new FormData(form);
      const data = {};
      for (const key of new Set(fd.keys())) {
        const all = fd.getAll(key);
        // Trailing [] is the convention for a repeated field; strip it for
        // readability and always hand those back as an array, even at length 1.
        const clean = key.replace(/\[\]$/, '');
        data[clean] = key.endsWith('[]') ? all : (all.length > 1 ? all : all[0]);
      }

      const success  = $('[data-form-success]');
      const errorBox = $('[data-form-error]');
      const submit   = $('button[type="submit"]', form);
      const endpoint = (form.getAttribute('data-endpoint') || '').trim();
      const fallback = (form.getAttribute('data-fallback-email') || '').trim();

      const label = {
        name: 'Name', email: 'Email', phone: 'Phone', subject: 'Subject',
        county: 'County of interest', acreage: 'Acreage range', message: 'Message'
      };
      const asText = () => Object.keys(data)
        .filter(k => k !== 'consent' && data[k] && String(data[k]).length)
        .map(k => `${label[k] || k}: ${Array.isArray(data[k]) ? data[k].join(', ') : data[k]}`)
        .join('\n');

      // Last resort so an inquiry is never accepted on screen and then lost:
      // hand it to the visitor's own mail client, already filled in.
      const openMailFallback = () => {
        if (!fallback) return false;
        const subjects = Array.isArray(data.subject) ? data.subject.join(', ') : (data.subject || 'Website inquiry');
        const href = `mailto:${fallback}`
          + `?subject=${encodeURIComponent('Website inquiry — ' + subjects)}`
          + `&body=${encodeURIComponent(asText())}`;
        // Length-capped: very long mailto URLs are silently dropped by some
        // clients, and a truncated email beats no email.
        window.location.href = href.slice(0, 1800);
        return true;
      };

      const finish = () => {
        success?.classList.add('is-visible');
        if (errorBox) errorBox.hidden = true;
        form.reset();
        // form.reset() restores the checkboxes but not the summary text that
        // was derived from them.
        $$('[data-multiselect]', form).forEach(r => r._multiselect && r._multiselect.render());
        if (success && typeof success.scrollIntoView === 'function') {
          success.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };

      const failed = () => {
        const opened = openMailFallback();
        if (errorBox) errorBox.hidden = false;
        if (!opened && errorBox && typeof errorBox.scrollIntoView === 'function') {
          errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };

      if (!endpoint) {
        // No handler configured yet — go straight to the mail client rather
        // than showing a confirmation for something nobody will receive.
        console.info('[NLI] No data-endpoint set; handing off to the mail client:', data);
        if (openMailFallback()) finish();
        else if (errorBox) errorBox.hidden = false;
        return;
      }

      if (submit) { submit.disabled = true; submit.dataset.label = submit.textContent; submit.textContent = 'Sending…'; }

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: fd
      })
        .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); finish(); })
        .catch(err => { console.error('[NLI] Inquiry failed to send:', err); failed(); })
        .finally(() => {
          if (submit) { submit.disabled = false; submit.textContent = submit.dataset.label || 'Send Message'; }
        });
    });
  }

  /* --- boot --------------------------------------------------------------- */

  let booted = false;

  function init() {
    // Guard against double-boot (script included twice, or a late
    // DOMContentLoaded after we've already started on a ready document).
    // Without this, map markers and event handlers get bound twice.
    if (booted) return;
    booted = true;

    // Each block is isolated: a failure in the hero must not stop the
    // listings, the form, or the map from working.
    const safe = (name, fn) => {
      try { fn(); } catch (err) { console.error(`[NLI] ${name} failed`, err); }
    };
    safe('chrome', initChrome);
    safe('hero', initHero);
    safe('slideshows', initSlideshows);
    // Must run before initForm: the form's prefill reaches for the API that
    // initMultiSelects attaches to each dropdown.
    safe('multiselects', initMultiSelects);
    safe('form', initForm);
    safe('county select', initCountySelect);

    const page = document.body.dataset.page;
    // Two pages, two runners.
    const runners = {
      home: initHome,
      properties: initProperties
    };
    const run = runners[page];
    if (run) {
      run().catch(err => {
        console.error('[NLI]', err);
        const host = $('[data-results], [data-featured], [data-map-list], [data-land-map]');
        if (host) {
          host.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <p class="h3">Content could not load.</p>
            <p>If you're opening these files directly, run a local server instead —
            browsers block <code>fetch()</code> on <code>file://</code>.<br>
            From the site folder: <code>python -m http.server 8080</code>, then visit
            <code>http://localhost:8080</code>.</p></div>`;
        }
      });
    }
  }

  // If the document is already parsed (deferred/async script, or an injected
  // one), DOMContentLoaded will never fire again — boot immediately instead.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { state, getProperties };
})();

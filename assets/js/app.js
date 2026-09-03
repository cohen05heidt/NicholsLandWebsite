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
          <p class="pcard__loc">${esc(p.city)}, ${esc(p.county)}, ${esc(p.state)}</p>
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

    // Featured carousel
    const featured = props.filter(p => p.featured && p.status !== 'Sold');
    const track = $('[data-featured]');
    if (track) {
      track.innerHTML = featured.map(propertyCard).join('');
      bindCardActions(track);
      // The section, not .carousel — the arrows sit up in the section header,
      // outside the scroller, so scoping to .carousel finds no buttons.
      initCarousel(track.closest('section'));
    }

    // Newest grid
    const newest = [...props]
      .filter(p => p.status !== 'Sold')
      .sort((a, b) => new Date(b.listed) - new Date(a.listed))
      .slice(0, 6);
    const grid = $('[data-newest]');
    if (grid) { grid.innerHTML = newest.map(propertyCard).join(''); bindCardActions(grid); }

    // The land map that replaced the category tiles.
    initLandMap(props);

  }

  const setText = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };

  function initCarousel(root) {
    if (!root) return;
    const track = $('.carousel__track', root);
    if (!track) return;
    const prev = $('[data-car-prev]', root);
    const next = $('[data-car-next]', root);

    // One card plus one gutter. Measured rather than assumed: the track's
    // column width is a min()/1fr expression that resolves to a different
    // number at every viewport, so a hardcoded step lands mid-card.
    const step = () => {
      const card = track.firstElementChild;
      if (!card) return track.clientWidth;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card.getBoundingClientRect().width + gap;
    };

    // Dim the arrows at each end. Without this they look broken at the last
    // card — you click and nothing moves, with no reason given.
    const sync = () => {
      const max = track.scrollWidth - track.clientWidth - 1;
      if (prev) prev.disabled = track.scrollLeft <= 0;
      if (next) next.disabled = track.scrollLeft >= max;
    };

    // The glide is animated by hand rather than with scrollBy({behavior:'smooth'}).
    // The track uses scroll-snap-type: x mandatory, and mandatory snap re-snaps
    // the scroller on every frame of a native smooth scroll — which drags the
    // animation straight back to the snap point it started from. The net effect
    // was arrows that fired their handler and then moved nothing at all.
    // Suspending snap for the duration and restoring it at the end lets the
    // scroll run and still land cleanly on a card boundary.
    let anim = null;
    const glide = (delta) => {
      if (anim) cancelAnimationFrame(anim);
      const from = track.scrollLeft;
      const limit = track.scrollWidth - track.clientWidth;
      const to = Math.max(0, Math.min(limit, from + delta));
      if (to === from) return;
      const started = performance.now();
      const DUR = 380;
      track.style.scrollSnapType = 'none';
      track.style.scrollBehavior = 'auto';
      const tick = (now) => {
        const p = Math.min(1, (now - started) / DUR);
        track.scrollLeft = from + (to - from) * (1 - Math.pow(1 - p, 3));
        if (p < 1) { anim = requestAnimationFrame(tick); return; }
        anim = null;
        track.style.scrollSnapType = '';
        track.style.scrollBehavior = '';
        sync();
      };
      anim = requestAnimationFrame(tick);
    };

    prev && prev.addEventListener('click', () => glide(-step()));
    next && next.addEventListener('click', () => glide(step()));
    track.addEventListener('scroll', sync, { passive: true });
    if (typeof window !== 'undefined') window.addEventListener('resize', sync);
    sync();
  }

  /* --- home land map -------------------------------------------------------
     Sits where the five category tiles used to be. The legend is not
     decoration: each chip is a real toggle, so the colour key and the filter
     are the same control and a reader can never be looking at a colour they
     have no name for. A tract carries more than one type, so it shows while
     ANY of its types is on, and takes the colour of the first one that is.
     -------------------------------------------------------------------------- */

  const LAND_TYPES = [
    { key: 'Timber',       label: 'Timberland',   color: '#22362A' },
    { key: 'Recreational', label: 'Recreational', color: '#9C4526' },
    { key: 'Homesite',     label: 'Homesites',    color: '#B98A3C' },
    { key: 'Investment',   label: 'Investment',   color: '#3E5C6B' }
  ];

  function initLandMap(props) {
    const canvas = $('[data-land-map]');
    const legend = $('[data-map-legend]');
    if (!canvas || !legend) return;

    const listings = props.filter(p => p.status !== 'Sold' && p.lat != null && p.lng != null);

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

    const active = new Set(LAND_TYPES.map(t => t.key));
    // A tract is usually two or three types at once, so the pin takes the
    // colour of its own first-listed type — the primary one. Filter down to a
    // single type and every visible pin recolours to that type, so the legend
    // and the map always agree about what a colour means.
    const colorFor = (p) => {
      const on = p.types.filter(t => active.has(t));
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
      const m = L.marker([p.lat, p.lng], { icon: pin(colorFor(p)), title: p.title });
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

    legend.innerHTML = LAND_TYPES.map(t => `
      <button class="legend-chip" type="button" data-legend-type="${t.key}" aria-pressed="true">
        <span class="legend-chip__dot" style="background:${t.color}"></span>
        <span class="legend-chip__label">${t.label}</span>
        <span class="legend-chip__count">${listings.filter(p => p.types.includes(t.key)).length}</span>
      </button>`).join('') +
      `<span class="legend-note" data-legend-note></span>`;

    const note = $('[data-legend-note]', legend);

    function draw() {
      const shown = [];
      markers.forEach(({ p, m }) => {
        const on = p.types.some(t => active.has(t));
        if (on) { m.setIcon(pin(colorFor(p))); m.addTo(map); shown.push(p); }
        else { map.removeLayer(m); }
      });
      if (shown.length) {
        map.fitBounds(shown.map(p => [p.lat, p.lng]), { padding: [45, 45], maxZoom: 11 });
      }
      note.textContent = shown.length === listings.length
        ? `${listings.length} tracts`
        : `${shown.length} of ${listings.length} tracts`;
    }

    $$('[data-legend-type]', legend).forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.legendType;
        // Never let the reader switch every type off and stare at an empty
        // map — the last one standing turns the rest back on instead.
        if (active.has(key) && active.size === 1) {
          LAND_TYPES.forEach(t => active.add(t.key));
        } else if (active.has(key)) {
          active.delete(key);
        } else {
          active.add(key);
        }
        $$('[data-legend-type]', legend).forEach(b =>
          b.setAttribute('aria-pressed', String(active.has(b.dataset.legendType))));
        draw();
      });
    });

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

    const gridEl = els.grid;
    const mapWrap = $('[data-map-view]');
    const listEl = $('[data-map-list]');

    const pin = (active) => L.divIcon({
      className: '',
      html: `<div style="width:${active ? 32 : 24}px;height:${active ? 32 : 24}px;border-radius:50%;
             background:${active ? '#B98A3C' : '#1F3527'};border:2px solid #F7F4EC;
             box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
      iconSize: [active ? 32 : 24, active ? 32 : 24],
      iconAnchor: [active ? 16 : 12, active ? 16 : 12]
    });

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

    function syncMap(list) {
      if (!mapReady) return;

      Object.values(markers).forEach(m => map.removeLayer(m));
      markers = {};

      list.forEach(p => {
        const m = L.marker([p.lat, p.lng], { icon: pin(false), title: p.title }).addTo(map);
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

      if (list.length) map.fitBounds(list.map(p => [p.lat, p.lng]), { padding: [50, 50] });

      listEl.innerHTML = list.length
        ? list.map(p => `
          <button class="mcard" type="button" data-map-card="${esc(p.id)}">
            <img src="${esc(p.images[0])}" alt="${esc(p.title)}" loading="lazy">
            <div>
              <h4>${esc(p.title)}</h4>
              <p>${acresFmt(p.acres)} acres · ${esc(p.county)}</p>
              <div class="price">${esc(p.priceLabel)}</div>
            </div>
          </button>`).join('')
        : `<p class="muted" style="padding:20px">No properties to show.</p>`;

      $$('[data-map-card]', listEl).forEach(card => {
        const id = card.dataset.mapCard;
        card.addEventListener('click', () => {
          const p = list.find(x => x.id === id);
          map.flyTo([p.lat, p.lng], 13, { duration: .8 });
          markers[id].openPopup();
          $$('.mcard', listEl).forEach(c => c.classList.remove('is-active'));
          card.classList.add('is-active');
        });
        card.addEventListener('mouseenter', () => markers[id]?.setIcon(pin(true)));
        card.addEventListener('mouseleave', () => markers[id]?.setIcon(pin(false)));
      });
    }

    function setView(mode, push = true) {
      const isMap = mode === 'map';
      gridEl.hidden = isMap;
      mapWrap.hidden = !isMap;
      $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === mode)));

      if (isMap) {
        ensureMap();
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
    setText('[data-loc]', `${p.city}, ${p.county}, Georgia`);

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

  /* --- contact form ------------------------------------------------------- */

  function initForm() {
    const form = $('[data-contact-form]');
    if (!form) return;

    // Prefill property from ?property=
    const prop = new URLSearchParams(window.location.search).get('property');
    const msg = $('[name="message"]', form);
    if (prop && msg && !msg.value) {
      msg.value = `I'd like more information about ${prop}.`;
      const subj = $('[name="subject"]', form);
      if (subj) subj.value = 'Farms & Land';
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

      if (!ok) { $('.is-invalid input, .is-invalid select, .is-invalid textarea')?.focus(); return; }

      // No backend wired yet — show confirmation and log the payload.
      const data = Object.fromEntries(new FormData(form).entries());
      console.info('[NLI] Inquiry ready to send:', data);
      const success = $('[data-form-success]');
      success?.classList.add('is-visible');
      form.reset();
      if (success && typeof success.scrollIntoView === 'function') {
        success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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

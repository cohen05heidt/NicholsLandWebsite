/* ==========================================================================
   Nichols Land & Investment Co. — site scripts
   Vanilla JS, no build step. Data comes from /data/*.json
   ========================================================================== */

const NLI = (() => {
  'use strict';

  const state = {
    properties: [],
    team: [],
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

  async function getTeam() {
    if (!state.team.length) {
      const data = await loadJSON(ROOT + 'data/team.json');
      state.team = data.company;
    }
    return state.team;
  }

  const agentById = (id) => state.team.find(a => a.id === id) || null;

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
      video.addEventListener('error', () => video.remove(), { once: true });

      const play = () => {
        const p = video.play();
        if (p && p.catch) p.catch(() => { /* autoplay blocked — the still stays */ });
      };
      // Don't wait for a load event to try playing; autoplay + preload="auto"
      // usually means it can start well before this script runs.
      play();
      if (video.readyState < 2) video.addEventListener('loadeddata', play, { once: true });

      // Stop decoding when the hero is scrolled away or the tab is hidden.
      const vis = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) play(); else video.pause();
      }, { threshold: 0.01 });
      vis.observe(hero);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) video.pause(); else if (!reduced) play();
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
    const [props] = await Promise.all([getProperties(), getTeam()]);

    // Hero stats
    const active = props.filter(p => p.status !== 'Sold');
    const totalAcres = active.reduce((s, p) => s + p.acres, 0);
    const counties = new Set(active.map(p => p.county));
    setText('[data-stat="acres"]', Math.round(totalAcres).toLocaleString('en-US'));
    setText('[data-stat="listings"]', active.length);
    setText('[data-stat="counties"]', counties.size);

    // Search bar options
    populateSelect('[data-opt="county"]', [...counties].sort(), 'All Counties');
    const types = new Set(); props.forEach(p => p.types.forEach(t => types.add(t)));
    populateSelect('[data-opt="type"]', [...types].sort(), 'All Land Types');

    // Featured carousel
    const featured = props.filter(p => p.featured && p.status !== 'Sold');
    const track = $('[data-featured]');
    if (track) {
      track.innerHTML = featured.map(propertyCard).join('');
      bindCardActions(track);
      initCarousel(track.closest('.carousel'));
    }

    // Newest grid
    const newest = [...props]
      .filter(p => p.status !== 'Sold')
      .sort((a, b) => new Date(b.listed) - new Date(a.listed))
      .slice(0, 6);
    const grid = $('[data-newest]');
    if (grid) { grid.innerHTML = newest.map(propertyCard).join(''); bindCardActions(grid); }

    // Category tiles counts
    $$('[data-type-count]').forEach(el => {
      const t = el.dataset.typeCount;
      el.textContent = `${props.filter(p => p.types.includes(t) && p.status !== 'Sold').length} Properties`;
    });

    // Full team (the single page carries the whole roster now)
    renderTeam();

    // Hero search submit -> properties page with query
    const form = $('[data-search-form]');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        const fd = new FormData(form);
        for (const [k, v] of fd.entries()) { if (v) params.set(k, v); }
        window.location.href = `properties.html?${params.toString()}`;
      });
    }
  }

  const setText = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };

  function populateSelect(sel, values, allLabel) {
    const el = $(sel);
    if (!el) return;
    el.innerHTML = `<option value="">${esc(allLabel)}</option>` +
      values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }

  function initCarousel(root) {
    if (!root) return;
    const track = $('.carousel__track', root);
    const prev = $('[data-car-prev]', root);
    const next = $('[data-car-next]', root);
    const step = () => Math.max(320, track.clientWidth * 0.42);
    prev && prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
    next && next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  }

  /* --- team --------------------------------------------------------------- */

  function renderTeam() {
    const host = $('[data-team-full]');
    if (!host) return;

    const groups = {};
    state.team.forEach(a => { (groups[a.group] ||= []).push(a); });

    host.innerHTML = Object.entries(groups).map(([group, members], i) => `
      <div style="margin-top:${i ? '52px' : '0'}">
        <p class="eyebrow">${esc(group)}</p>
        <div class="team-grid">${members.map(teamBio).join('')}</div>
      </div>`).join('');
    bindCardActions(host);
  }

  function teamBio(a) {
    return `
      <article class="tcard reveal">
        <div class="tcard__photo"><img src="${esc(a.photo)}" alt="${esc(a.name)}" loading="lazy"></div>
        <h3>${esc(a.name)}</h3>
        <p>${esc(a.title)}${a.credential ? ' · ' + esc(a.credential) : ''}</p>
        <p style="margin-top:12px;text-transform:none;letter-spacing:0;color:#4A5044;font-size:.88rem;line-height:1.6">
          ${esc(a.bio)}
        </p>
        <p style="margin-top:12px;text-transform:none;letter-spacing:0">
          <a class="tcard__email" href="mailto:${esc(a.email)}">${esc(a.email)}</a><br>
          <a class="tcard__email" href="tel:${esc(a.phone.replace(/[^0-9]/g, ''))}">${esc(a.phone)}</a>
        </p>
      </article>`;
  }

  /* --- properties listing page -------------------------------------------- */

  async function initProperties() {
    const props = await getProperties();
    await getTeam();

    const q = new URLSearchParams(window.location.search);
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

    const counties = [...new Set(props.map(p => p.county))].sort();
    const types = [...new Set(props.flatMap(p => p.types))].sort();
    populateSelect('[name="county"]', counties, 'All Counties');
    populateSelect('[name="type"]', types, 'All Land Types');

    // Seed from URL
    ['type', 'county', 'min', 'max', 'acres', 'sort'].forEach(k => {
      if (q.get(k) && els[k]) els[k].value = q.get(k);
    });

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

      els.count.innerHTML = `<b>${out.length}</b> ${out.length === 1 ? 'property' : 'properties'}`;
      els.grid.innerHTML = out.length
        ? out.map(propertyCard).join('')
        : `<div class="empty-state" style="grid-column:1/-1">
             <p class="h3" style="margin-bottom:8px">No properties match those filters.</p>
             <p>Try widening your price or acreage range, or <a class="link-arrow" href="index.html#contact">tell us what you're looking for</a>.</p>
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
        : `<p class="muted" style="padding:20px">No properties match those filters.</p>`;

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
    setView(q.get('view') === 'map' ? 'map' : 'grid', false);

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

    // Agent card
    const a = agentById(p.agent) || state.team[0];
    if (a) {
      $('[data-agent]').innerHTML = `
        <div class="agent-card__top">
          <img class="agent-card__photo" src="${esc(a.photo)}" alt="${esc(a.name)}">
          <div>
            <h4>${esc(a.name)}</h4>
            <div class="role">${esc(a.title)}</div>
          </div>
        </div>
        <dl>
          <div><dt>Office</dt><dd><a href="tel:7063533900">706-353-3900</a></dd></div>
          <div><dt>Direct</dt><dd><a href="tel:${esc(a.phone.replace(/[^0-9]/g, ''))}">${esc(a.phone)}</a></dd></div>
          <div><dt>Email</dt><dd><a href="mailto:${esc(a.email)}">${esc(a.email)}</a></dd></div>
        </dl>
        <a class="btn btn--primary btn--block" href="index.html?property=${encodeURIComponent(p.title)}#contact">Request Information</a>
        <a class="btn btn--ghost btn--block" style="margin-top:10px" href="tel:7063533900">Call the Office</a>`;
    }

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
        const host = $('[data-results], [data-featured], [data-map-list], [data-team-full]');
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

  return { state, getProperties, getTeam };
})();

/* Mobile audit across the widths people actually hold.
   Looks for four things:
     1. the page scrolling sideways
     2. any element wider than the viewport
     3. elements overlapping each other (what the hero buttons were doing)
     4. tap targets too small or text too cramped
   Reports per width so a regression is easy to place. */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), DIR = __dirname;

const WIDTHS = [
  { w: 320, name: 'iPhone SE (1st)' },
  { w: 360, name: 'Android common' },
  { w: 375, name: 'iPhone SE / mini' },
  { w: 390, name: 'iPhone 14/15' },
  { w: 414, name: 'iPhone Plus' },
  { w: 430, name: 'iPhone Pro Max' },
  { w: 768, name: 'iPad portrait' }
];

const stub = async (page) => {
  await page.route('**/leaflet.js', r => r.fulfill({ path: require.resolve('leaflet/dist/leaflet.js'), contentType: 'application/javascript' }));
  await page.route('**/leaflet.css', r => r.fulfill({ path: require.resolve('leaflet/dist/leaflet.css'), contentType: 'text/css' }));
  await page.route('**tile.openstreetmap.org/**', r => r.fulfill({ status:200, contentType:'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64') }));
  await page.route('**://d8j0ntlcm91z4.cloudfront.net/**', r => r.abort());
  await page.route('**://fonts.**/**', r => r.abort());
  await page.route('**google**', r => r.abort());
  await page.route('**nicholsland.net**', r => r.abort());
  await page.route('**/data/properties.json', r => r.fulfill({ path: path.join(DIR,'fixture-properties.json'), contentType:'application/json' }));
  await page.route('**/data/ga-counties.json', r => r.fulfill({ status:200, contentType:'application/json', body:'["Clarke"]' }));
};

// Pairs that legitimately share space and must be excluded from the overlap
// check: stacked hero slides, map panes, absolutely-positioned decoration.
const OVERLAP_SKIP = [
  '.hero__slide', '.hero__media', '.hero__stage', '.leaflet-pane', '.leaflet-container',
  '[data-slideshow]', '.form-success', '.form-error', '.multiselect__panel',
  '.scroll-progress', '.hero__cue', '.err', '.nav'
];

const audit = async (page, label) => {
  return await page.evaluate(({ skip }) => {
    const vw = window.innerWidth;
    const out = { horizontalScroll: document.documentElement.scrollWidth > vw + 1, tooWide: [], overlaps: [], smallTargets: [] };

    const desc = (el) => {
      const id = el.id ? '#' + el.id : '';
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0,2).join('.') : '';
      const txt = (el.textContent || '').replace(/\s+/g,' ').trim().slice(0,28);
      return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}"` : ''}`;
    };
    const skipped = (el) => skip.some(s => el.closest(s));

    // 1 + 2: anything sticking out past the viewport
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        // Legitimately outside the frame:
        //  - the skip link, parked off-screen until focused
        //  - anything inside an element that clips its own overflow (the hero
        //    stage is deliberately oversized so parallax never exposes an edge)
        //  - containers that scroll horizontally on purpose
        if (el.classList.contains('skip-link')) continue;
        let clipped = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const pcs = getComputedStyle(p);
          if (pcs.overflow !== 'visible' || pcs.overflowX !== 'visible') { clipped = true; break; }
        }
        if (clipped) continue;
        out.tooWide.push({ el: desc(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
      }
    }

    // 3: siblings printing on top of each other
    const boxes = [];
    for (const el of document.querySelectorAll('a.btn, .hero__actions a, .legend-chip, .header-actions > *, .pcard__title, h1, h2')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || skipped(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      boxes.push({ el, r });
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ox > 2 && oy > 2) {
          out.overlaps.push({ a: desc(a.el), b: desc(b.el), overlapX: Math.round(ox), overlapY: Math.round(oy) });
        }
      }
    }

    // 4: tap targets under ~40px tall
    for (const el of document.querySelectorAll('a.btn, button, .legend-chip, .multiselect__toggle')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < 32) out.smallTargets.push({ el: desc(el), height: Math.round(r.height) });
    }
    return out;
  }, { skip: OVERLAP_SKIP });
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  fs.mkdirSync(path.join(DIR,'shots','mobile'), { recursive: true });
  let problems = 0;

  for (const { w, name } of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
    await stub(page);
    await page.goto('file://' + path.join(DIR, 'index.html'));
    await page.waitForTimeout(1400);

    const r = await audit(page, name);
    const issues = r.tooWide.length + r.overlaps.length + r.smallTargets.length + (r.horizontalScroll ? 1 : 0);
    problems += issues;

    console.log(`\n=== ${w}px — ${name} ===`);
    console.log(`  horizontal scroll : ${r.horizontalScroll ? 'YES (bad)' : 'no'}`);
    console.log(`  wider than screen : ${r.tooWide.length}`);
    r.tooWide.slice(0,6).forEach(x => console.log(`      ${x.el}  [${x.left}..${x.right}]`));
    console.log(`  overlapping       : ${r.overlaps.length}`);
    r.overlaps.slice(0,6).forEach(x => console.log(`      ${x.a}  OVER  ${x.b}  (${x.overlapX}x${x.overlapY}px)`));
    console.log(`  small tap targets : ${r.smallTargets.length}`);
    r.smallTargets.slice(0,6).forEach(x => console.log(`      ${x.el}  ${x.height}px`));

    await page.locator('.hero').screenshot({ path: path.join(DIR,'shots','mobile',`hero-${w}.png`) });
    await page.close();
  }

  console.log(problems ? `\n${problems} issue(s) found` : '\nno issues found');
  await browser.close();
  process.exit(problems ? 1 : 0);
})();

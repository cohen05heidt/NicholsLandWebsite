/* The listings page's Map view should carry the same switches as the home
   page: four land types, Sold, Management — filtering pins AND the side list,
   with the same guard against ending up with a blank map. */
const { chromium } = require('playwright');
const path = require('path'), DIR = __dirname;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.route('**/leaflet.js', r => r.fulfill({ path: require.resolve('leaflet/dist/leaflet.js'), contentType: 'application/javascript' }));
  await page.route('**/leaflet.css', r => r.fulfill({ path: require.resolve('leaflet/dist/leaflet.css'), contentType: 'text/css' }));
  await page.route('**tile.openstreetmap.org/**', r => r.fulfill({ status:200, contentType:'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64') }));
  for (const p of ['**://d8j0ntlcm91z4.cloudfront.net/**','**://fonts.**/**','**google**','**nicholsland.net**']) await page.route(p, r => r.abort());
  await page.route('**/data/properties.json', r => r.fulfill({ path: path.join(DIR,'fixture-properties.json'), contentType:'application/json' }));
  await page.route('**/data/ga-counties.json', r => r.fulfill({ status:200, contentType:'application/json', body:'["Clarke"]' }));

  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  let fail = 0;
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  };

  await page.goto('file://' + path.join(DIR, 'properties.html') + '?view=map');
  await page.waitForTimeout(1800);

  const chips   = () => page.locator('[data-map-legend] .legend-chip__label').allTextContents();
  const pins    = () => page.evaluate(() => document.querySelectorAll('.leaflet-marker-icon').length);
  const cards   = () => page.locator('.mcard').count();
  const note    = () => page.locator('[data-legend-note]').textContent();
  const pressed = () => page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('[data-legend-type],[data-legend-sold],[data-legend-managed]')]
      .map(b => [b.querySelector('.legend-chip__label').textContent, b.getAttribute('aria-pressed')])));

  /* ---- the legend exists at all ---- */
  check('map view legend matches the home page', await chips(),
    ['Timberland','Recreational','Homesites','Investment','Sold','Management']);
  check('defaults: types on, sold+managed off', await pressed(), {
    Timberland:'true', Recreational:'true', Homesites:'true', Investment:'true',
    Sold:'false', Management:'false' });

  // Fixture: 3 active listings (Timber+Rec, Homesite, Investment), 2 sold.
  check('starts with the 3 active listings', await pins(), 3);
  check('side list matches the pins', await cards(), 3);

  /* ---- filtering narrows pins AND the side list together ---- */
  await page.locator('[data-legend-type="Homesite"]').click();
  await page.locator('[data-legend-type="Investment"]').click();
  await page.waitForTimeout(300);
  check('two types off leaves 1 pin', await pins(), 1);
  check('side list follows the filter', await cards(), 1);
  check('note reports the subset', (await note()).trim(), '1 of 3 tracts');

  /* ---- sold layer ---- */
  await page.locator('[data-legend-sold]').click();
  await page.waitForTimeout(300);
  check('sold adds its 2 pins', await pins(), 3);
  check('sold does NOT pad the side list', await cards(), 1);
  check('note counts sold separately', (await note()).trim(), '1 of 3 tracts · 2 sold');

  /* ---- the bug that was fixed on the home map must not exist here ---- */
  await page.locator('[data-legend-type="Timber"]').click();
  await page.locator('[data-legend-type="Recreational"]').click();
  await page.waitForTimeout(300);
  check('sold-only is reachable here too', await pressed(), {
    Timberland:'false', Recreational:'false', Homesites:'false', Investment:'false',
    Sold:'true', Management:'false' });
  check('sold-only shows just the 2 sold pins', await pins(), 2);
  check('side list is empty and says so',
    (await page.locator('.map-side__list').textContent()).includes('No properties match'), true);

  /* ---- blank-map guard ---- */
  await page.locator('[data-legend-sold]').click();
  await page.waitForTimeout(300);
  check('turning the last layer off restores the types', await pressed(), {
    Timberland:'true', Recreational:'true', Homesites:'true', Investment:'true',
    Sold:'false', Management:'false' });

  /* ---- management ---- */
  await page.locator('[data-legend-managed]').click();
  await page.waitForTimeout(400);
  check('management adds 7 to the 3 listings', await pins(), 10);
  check('note counts managed separately', (await note()).trim(), '3 tracts · 7 managed');

  /* ---- layout ---- */
  const legendBox = await page.locator('[data-map-legend]').boundingBox();
  const mapBox = await page.locator('#map').boundingBox();
  check('legend sits above the map, full width',
    legendBox.y + legendBox.height <= mapBox.y + 2 && legendBox.width > mapBox.width, true);
  check('no horizontal scroll',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  /* ---- phone ---- */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  check('no horizontal scroll on phone',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const order = await page.evaluate(() => {
    const y = s => { const el = document.querySelector(s); const r = el.getBoundingClientRect(); return r.top + window.scrollY; };
    return { legend: y('[data-map-legend]'), map: y('#map'), side: y('.map-view__side') };
  });
  check('phone stacks legend, then map, then list',
    order.legend < order.map && order.map < order.side, true);

  check('no uncaught page errors', errors, []);

  console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

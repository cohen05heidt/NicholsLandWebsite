/**
 * Rebuilds data/commercial.json from the one-file-per-listing sources in
 * data/commercial/.
 *
 * The commercial book used to live as hand-written markup inside index.html,
 * on the reasoning that two buildings did not justify a feed. That reasoning
 * had one hole in it: whoever manages listings can add, edit and remove land
 * through the admin, but could not touch the commercial cards at all — those
 * needed a developer and a commit. This script closes that hole, so every
 * listing on the site is managed in the same place by the same people.
 *
 * It mirrors tools/build-properties.mjs deliberately. Same shape, same
 * failure behaviour: a malformed listing stops the build rather than
 * publishing a site with a building silently missing from it. And, like the
 * land build, it derives every display label from the plain numbers typed
 * into the admin — "$850,000", "1,302 SF", "0.63± Acres", "$18.50/SF/yr NNN" —
 * so a card can never show a figure and a label that disagree.
 *
 * Output keeps the older `image` and `facts` fields alongside the new ones,
 * so a page still running the previous app.js keeps working through a deploy.
 *
 * Run locally with:  node tools/build-commercial.mjs
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'data/commercial';
const OUT = 'data/commercial.json';

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const finite = (v) => Number.isFinite(v);
const money = (n, digits = 0) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** Closed deals show what happened, not a number: a price on a sold or leased
 *  building invites calls about space that is gone. */
const CLOSED = { Sold: 'Sold', Leased: 'Leased' };

/** 18.5 + "NNN" -> "$18.50/SF/yr NNN". A lease quoted per month (small retail
 *  bays, single suites) reads "$2,400/mo". */
const leaseLabel = (rate, basis, terms) => {
  if (!finite(rate)) return '';
  const tail = terms ? ` ${terms}` : '';
  if (basis === 'per month') return `${money(rate)}/mo${tail}`;
  return `${money(rate, 2)}/SF/yr${tail}`;
};

/** The one headline figure a card has room for. Sale price when there is one,
 *  otherwise the lease rate, otherwise "Call for Price". */
const priceLabel = (price, lease, status) => {
  if (CLOSED[status]) return CLOSED[status];
  if (finite(price)) return money(price);
  if (lease) return lease;
  return 'Call for Price';
};

const sqftLabel = (sf) => (finite(sf) ? `${Math.round(sf).toLocaleString('en-US')} SF` : '');
const acresLabel = (a) =>
  finite(a) ? `${a.toLocaleString('en-US', { maximumFractionDigits: 2 })}± Acres` : '';

/** Same rule as the land build: a photo or document that is named but not in
 *  the repository is left off (with a warning) rather than shown broken.
 *  Links to other sites are kept as written. */
const isLocal = (p) => !/^[a-z][a-z0-9+.-]*:/i.test(String(p));
const onDisk = (p) => {
  const rel = String(p).replace(/^\/+/, '').split(/[?#]/)[0];
  let decoded = rel;
  try { decoded = decodeURI(rel); } catch { /* keep as typed */ }
  return existsSync(rel) || existsSync(decoded);
};
const SHOWABLE = /\.(jpe?g|png|webp|gif|avif|svg)$/i;

/** Photos are served with a week-long cache, so replacing one used to leave
 *  every returning visitor looking at the old picture. The built feed points
 *  at "photo.webp?v=<hash of the file>", which changes the moment the file
 *  does and never changes when it does not. */
const stamp = (p) => {
  const s = String(p);
  if (!isLocal(s) || /[?#]/.test(s)) return s;
  const rel = s.replace(/^\/+/, '');
  for (const candidate of [rel, (() => { try { return decodeURI(rel); } catch { return rel; } })()]) {
    if (existsSync(candidate)) {
      return `${s}?v=${createHash('sha1').update(readFileSync(candidate)).digest('hex').slice(0, 8)}`;
    }
  }
  return s;
};

const REQUIRED = ['title', 'status', 'address'];

/* --- putting a new building on the map by itself --------------------------
 * A tract is drawn on a plat and whoever lists it has coordinates to hand. A
 * building has a street address, and asking the office to look up latitude and
 * longitude before a listing appears on the map is how listings end up not on
 * the map. So: any listing saved with an address and no pin gets geocoded
 * here, during the build, and the answer is written back into the listing so
 * it is visible (and correctable) in /admin and never looked up twice.
 *
 * The US Census geocoder is asked first — it is free, needs no key, and is
 * authoritative for American street addresses — then OpenStreetMap's
 * Nominatim as a fallback. Both are given a short timeout, and a failure is a
 * warning, not a broken build: the listing simply publishes without a pin,
 * exactly as it does today, and the next build tries again.
 */
const GEOCODE_TIMEOUT = 8000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getJSON = async (url, headers = {}) => {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(GEOCODE_TIMEOUT) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
};

const fromCensus = async (address) => {
  const url = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
    + `?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  const data = await getJSON(url);
  const hit = data?.result?.addressMatches?.[0]?.coordinates;
  return hit ? { lat: Number(hit.y), lng: Number(hit.x), by: 'the US Census geocoder' } : null;
};

const fromNominatim = async (address) => {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`;
  const data = await getJSON(url, { 'User-Agent': 'NicholsLandWebsite build (info@nicholsland.net)' });
  const hit = Array.isArray(data) && data[0];
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), by: 'OpenStreetMap' } : null;
};

/** In the Southeast, or it is not this listing's address. */
const plausible = (pt) => pt && Number.isFinite(pt.lat) && Number.isFinite(pt.lng)
  && pt.lat >= 24 && pt.lat <= 39.5 && pt.lng >= -92 && pt.lng <= -75;

async function geocode(address) {
  for (const lookup of [fromCensus, fromNominatim]) {
    try {
      const pt = await lookup(address);
      if (plausible(pt)) return pt;
    } catch (err) {
      warnings.push(`Address lookup failed for "${address}" (${err.message}).`);
    }
    await sleep(1100); // Nominatim asks for no more than one call a second.
  }
  return null;
}

const files = (await readdir(SRC)).filter((f) => f.endsWith('.json')).sort();

const listings = [];
const problems = [];
const warnings = [];

for (const file of files) {
  const id = path.basename(file, '.json');
  let raw;
  try {
    raw = JSON.parse(await readFile(path.join(SRC, file), 'utf8'));
  } catch (err) {
    problems.push(`${file}: not valid JSON — ${err.message}`);
    continue;
  }

  const missing = REQUIRED.filter((k) => raw[k] === undefined || raw[k] === '');
  if (missing.length) {
    problems.push(`${file}: missing ${missing.join(', ')}`);
    continue;
  }

  const present = (p, what) => {
    if (what === 'photo' && isLocal(p) && !SHOWABLE.test(String(p).split(/[?#]/)[0])) {
      warnings.push(`${file}: photo "${p}" is not a format browsers can show, so it was left off the page. Upload it again as a JPEG.`);
      return false;
    }
    if (!isLocal(p) || onDisk(p)) return true;
    warnings.push(`${file}: ${what} "${p}" is not in the website's files, so it was left off the page. Upload it again in /admin.`);
    return false;
  };

  const price = num(raw.price);
  const sqft = num(raw.sqft);
  const availableSqft = num(raw.availableSqft);
  const lotAcres = num(raw.lotAcres);
  const yearBuilt = num(raw.yearBuilt);
  const leaseRate = num(raw.leaseRate);
  const lat = num(raw.lat);
  const lng = num(raw.lng);

  const before = problems.length;
  for (const [label, v] of [['price', price], ['square footage', sqft], ['available square footage', availableSqft],
                            ['lot size', lotAcres], ['year built', yearBuilt], ['lease rate', leaseRate]]) {
    if (v !== null && !finite(v)) problems.push(`${file}: ${label} must be a plain number — got ${JSON.stringify(v)}.`);
  }
  if (problems.length > before) continue;

  // Nothing typed into Latitude/Longitude, but there is an address: look it
  // up once, and write it back into the listing so the map has it from the
  // next save onwards and the office can correct it in /admin if it lands on
  // the wrong side of the street.
  let learnedPin = null;
  if ((!finite(lat) || !finite(lng)) && raw.address) {
    learnedPin = await geocode(raw.address);
    if (learnedPin) {
      raw.lat = learnedPin.lat;
      raw.lng = learnedPin.lng;
      await writeFile(path.join(SRC, file), JSON.stringify(raw, null, 2) + '\n', 'utf8');
      console.log(`${file}: placed on the map at ${learnedPin.lat}, ${learnedPin.lng} from its address, via ${learnedPin.by}.`);
    } else {
      warnings.push(`${file}: could not find "${raw.address}" on the map, so the listing publishes without a pin. Type the latitude and longitude into the listing in /admin to place it by hand.`);
    }
  }

  // A pin outside the Southeast is almost always a longitude that lost its
  // minus sign. Drop the pin, keep the listing — same rule as the land build.
  let pinLat = finite(lat) ? lat : (learnedPin ? learnedPin.lat : null);
  let pinLng = finite(lng) ? lng : (learnedPin ? learnedPin.lng : null);
  if (pinLat === null || pinLng === null) {
    pinLat = pinLng = null;
  } else if (pinLat < 24 || pinLat > 39.5 || pinLng < -92 || pinLng > -75) {
    warnings.push(`${file}: published without a map pin — ${pinLat}, ${pinLng} is outside the Southeast` +
                  (pinLng > 0 ? ' (the longitude is missing its minus sign).' : '.'));
    pinLat = pinLng = null;
  }

  // Older records carried one `image`; the admin now keeps a gallery.
  const imagesIn = Array.isArray(raw.images) && raw.images.length ? raw.images : (raw.image ? [raw.image] : []);
  const images = imagesIn.filter(Boolean).filter((p) => present(p, 'photo')).map(stamp);
  const docs = (raw.docs ?? []).filter((d) => d && d.label && d.url && present(d.url, 'document'))
    .map((d) => ({ ...d, url: stamp(d.url) }));

  const lease = leaseLabel(leaseRate, raw.leaseBasis, raw.leaseTerms);
  const types = (Array.isArray(raw.propertyType) ? raw.propertyType : [raw.propertyType]).filter(Boolean);
  const extra = (raw.facts ?? []).filter((f) => f && f.label && f.value);

  // What fits across the bottom of a card: type and size when the admin has
  // them, then anything typed into "Other details" to fill the space.
  const cardFacts = [
    types.length && { label: 'Type', value: types.join(' / ') },
    finite(sqft) && { label: 'Size', value: sqftLabel(sqft) },
    !finite(sqft) && finite(lotAcres) && { label: 'Lot', value: acresLabel(lotAcres) },
    raw.occupancy && { label: 'Tenancy', value: raw.occupancy },
    ...extra,
  ].filter(Boolean).slice(0, 3);

  // Where the listing shows. "both" is the answer for almost every building;
  // the choice exists so a quiet listing can stay off the front page, and a
  // headline one can take a front-page slot without padding the full list.
  const placement = ['home', 'properties', 'both'].includes(raw.placement) ? raw.placement : 'both';

  listings.push({
    id,
    title: raw.title,
    placement,
    showHome: placement !== 'properties',
    showProperties: placement !== 'home',
    status: raw.status,
    propertyType: types,
    price: finite(price) ? price : null,
    priceLabel: priceLabel(price, lease, raw.status),
    leaseRate: finite(leaseRate) ? leaseRate : null,
    leaseLabel: CLOSED[raw.status] ? '' : lease,
    sqft: finite(sqft) ? sqft : null,
    sqftLabel: sqftLabel(sqft),
    availableSqft: finite(availableSqft) ? availableSqft : null,
    availableLabel: sqftLabel(availableSqft),
    lotAcres: finite(lotAcres) ? lotAcres : null,
    lotLabel: acresLabel(lotAcres),
    yearBuilt: finite(yearBuilt) ? yearBuilt : null,
    zoning: raw.zoning ?? '',
    parking: raw.parking ?? '',
    occupancy: raw.occupancy ?? '',
    suites: raw.suites ?? '',
    address: raw.address,
    county: raw.county ?? '',
    lat: pinLat,
    lng: pinLng,
    summary: raw.summary ?? '',
    highlights: (raw.highlights ?? []).filter(Boolean),
    details: extra,
    docs,
    images,
    alt: raw.alt || raw.title,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 999,
    // Kept for any page still running the previous app.js mid-deploy.
    image: images[0] || '',
    facts: cardFacts,
  });
}

for (const w of warnings) console.log(`::warning::${w}`);

if (problems.length) {
  console.error('Refusing to rebuild — fix these first:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// Explicit order first, then title, so the sequence on the page is something
// a person chooses rather than an accident of filenames.
listings.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

await writeFile(OUT, JSON.stringify(listings, null, 2) + '\n', 'utf8');
console.log(`Built ${OUT} from ${listings.length} listings.`);

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

  // A pin outside the Southeast is almost always a longitude that lost its
  // minus sign. Drop the pin, keep the listing — same rule as the land build.
  let pinLat = finite(lat) ? lat : null;
  let pinLng = finite(lng) ? lng : null;
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

  listings.push({
    id,
    title: raw.title,
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

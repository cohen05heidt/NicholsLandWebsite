/**
 * Rebuilds data/properties.json from the one-file-per-listing sources in
 * data/properties/.
 *
 * The site reads a single JSON array at runtime — it has no build step and no
 * server. The CMS, on the other hand, needs one file per listing so that
 * adding, editing and deleting a tract are ordinary operations on ordinary
 * files. This script is the seam between those two shapes, and the workflow in
 * .github/workflows/build-properties.yml runs it on every save.
 *
 * It also derives the two display labels. Whoever adds a listing types the
 * acreage and the price as plain numbers; "73.59± Acres" and "$149,500" are
 * this script's job, so the site can never end up with a figure and a label
 * that disagree.
 *
 * Run locally with:  node tools/build-properties.mjs
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'data/properties';
const OUT = 'data/properties.json';

/** 73.59 -> "73.59± Acres";  377 -> "377± Acres" (no trailing ".00"). */
const acresLabel = (acres) =>
  `${Number(acres).toLocaleString('en-US', { maximumFractionDigits: 2 })}± Acres`;

/** 149500 -> "$149,500";  null/blank -> "Call for Price". A sold tract shows
 *  "Sold" instead: there is nothing left to quote, and "Call for Price" on a
 *  closed sale invites calls about land that is gone. */
const priceLabel = (price, status) => {
  if (status === 'Sold') return 'Sold';
  return price === null || price === undefined || price === ''
    ? 'Call for Price'
    : `$${Number(price).toLocaleString('en-US')}`;
};

/** "Crawford, Oglethorpe County, GA" — skipping any part we do not have. */
const locationLabel = (city, county, state) =>
  [city, county, state].filter(Boolean).join(', ');

const REQUIRED = ['title', 'acres', 'status', 'county'];

/** Every tract on this site is in Georgia, which is a tight enough box to
 *  catch the mistake that actually happens: pasting the longitude from Google
 *  Maps without its minus sign, which silently moves the pin to China. A pin
 *  in the wrong hemisphere is not a cosmetic error — it is the map telling a
 *  buyer something false — so it stops the build rather than publishing. */
const GEORGIA = { lat: [30.2, 35.1], lng: [-85.8, -80.7] };

/** Managed assets are not listings and are not all in Georgia — the existing
 *  ones run from Knoxville to Lake City. They get a wider box, which still
 *  catches the mistake that matters (a longitude that lost its minus sign and
 *  landed in the eastern hemisphere). */
const SOUTHEAST = { lat: [24.0, 39.5], lng: [-92.0, -75.0] };

/** A figure typed with its units ("64.2 acres", "$315,000") reaches here as a
 *  string, and Number() turns it into NaN, which formats as "$NaN" and goes
 *  live looking like a broken website. The form's number boxes should stop it
 *  first; this is the floor under that. */
const asNumber = (value, field, file, problems) => {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    problems.push(`${file}: ${field} must be a plain number — got ${JSON.stringify(value)}. ` +
                  `Type 64.2, not "64.2 acres"; 315000, not "$315,000".`);
    return null;
  }
  return n;
};
/** A photo or document the listing names but the repository does not have
 *  (an upload that never finished, a file picked from the wrong folder) shows
 *  on the site as a broken image or a dead link. Local paths that do not
 *  exist are left off with a warning on the Actions run; links to other
 *  sites are kept as written. */
const isLocal = (p) => !/^[a-z][a-z0-9+.-]*:/i.test(String(p));
const onDisk = (p) => {
  const rel = String(p).replace(/^\/+/, '').split(/[?#]/)[0];
  let decoded = rel;
  try { decoded = decodeURI(rel); } catch { /* keep as typed */ }
  return existsSync(rel) || existsSync(decoded);
};
// What a browser can actually draw. Anything else (a HEIC the build could not
// convert, a TIFF) would show as a blank square, so it is left off too.
const SHOWABLE = /\.(jpe?g|png|webp|gif|avif|svg)$/i;
const present = (p, file, what, warnings) => {
  if (what === 'photo' && isLocal(p) && !SHOWABLE.test(String(p).split(/[?#]/)[0])) {
    warnings.push(`${file}: photo "${p}" is not a format browsers can show, so it was left off the page. Upload it again as a JPEG.`);
    return false;
  }
  if (!isLocal(p) || onDisk(p)) return true;
  warnings.push(`${file}: ${what} "${p}" is not in the website's files, so it was left off the page. Upload it again in /admin.`);
  return false;
};

// A live listing must say where it is. Sold records are archival and the old
// site often recorded only the county, so town is not demanded of them.
const REQUIRED_FOR_SALE = ['city'];

const files = (await readdir(SRC)).filter((f) => f.endsWith('.json')).sort();
if (!files.length) throw new Error(`No listings found in ${SRC}/`);

const properties = [];
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

  const required = raw.status === 'Sold' ? REQUIRED : [...REQUIRED, ...REQUIRED_FOR_SALE];
  const missing = required.filter((k) => raw[k] === undefined || raw[k] === '');
  if (missing.length) {
    problems.push(`${file}: missing ${missing.join(', ')}`);
    continue;
  }

  const price = raw.price === '' ? null : (raw.price ?? null);

  const before = problems.length;
  const acres = asNumber(raw.acres, 'acreage', file, problems);
  const coordNotes = [];
  const lat = asNumber(raw.lat, 'latitude', file, coordNotes);
  const lng = asNumber(raw.lng, 'longitude', file, coordNotes);
  if (coordNotes.length) warnings.push(...coordNotes.map((n) => n + ' Published without a map pin.'));
  if (price !== null) asNumber(price, 'price', file, problems);

  const managed = (raw.types ?? []).includes('Management');
  const box = managed ? SOUTHEAST : GEORGIA;
  const where = managed ? 'the Southeast' : 'Georgia';

  // A pin outside the box is dropped, not the listing. The tract still gets
  // its card, its page and its photos; it just has no map pin until the
  // numbers are corrected. Refusing to build here used to hold back every
  // other change on the site too, with nothing on the admin screen to say why.
  let pinLat = lat;
  let pinLng = lng;
  const pinIssues = [];
  if (lat !== null && (lat < box.lat[0] || lat > box.lat[1])) {
    pinIssues.push(`latitude ${lat} is outside ${where} (expected ${box.lat[0]} to ${box.lat[1]})`);
  }
  if (lng !== null && (lng < box.lng[0] || lng > box.lng[1])) {
    pinIssues.push(`longitude ${lng} is outside ${where} (expected ${box.lng[0]} to ${box.lng[1]}` +
                   (lng > 0 ? ' — it is missing its minus sign)' : ')'));
  }
  if (lat === null || lng === null || pinIssues.length) {
    pinLat = null;
    pinLng = null;
    if (pinIssues.length) {
      warnings.push(`${file}: published without a map pin — ${pinIssues.join('; ')}.`);
    }
  }
  // Only a figure that cannot be shown at all (acreage, price) holds a
  // listing back.
  if (problems.length > before) continue;

  properties.push({
    id,
    title: raw.title,
    acres,
    acresLabel: acresLabel(acres),
    price,
    priceLabel: priceLabel(price, raw.status),
    status: raw.status,
    featured: Boolean(raw.featured),
    county: raw.county,
    state: raw.state || 'GA',
    city: raw.city ?? '',
    locationLabel: locationLabel(raw.city, raw.county, raw.state || 'GA'),
    types: raw.types ?? [],
    // The CMS writes an ISO timestamp; the site only ever shows the date.
    listed: String(raw.listed ?? '').slice(0, 10),
    lat: pinLat,
    lng: pinLng,
    coordsApprox: raw.coordsApprox !== false,
    summary: raw.summary ?? '',
    bullets: raw.bullets ?? [],
    directions: raw.directions ?? '',
    docs: (raw.docs ?? []).filter((d) => d && d.label && d.url && present(d.url, file, 'document', warnings)),
    images: (raw.images ?? []).filter(Boolean).filter((p) => present(p, file, 'photo', warnings))
  });
}

// Shown as yellow annotations on the GitHub Actions run.
for (const w of warnings) console.log(`::warning::${w}`);

// A listing with a broken file must not silently vanish from the site.
if (problems.length) {
  console.error('Refusing to rebuild — fix these first:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// Newest first, so the "Recently Listed" row and the map agree on ordering.
properties.sort((a, b) => (a.listed < b.listed ? 1 : a.listed > b.listed ? -1 : a.id.localeCompare(b.id)));

await writeFile(OUT, JSON.stringify(properties, null, 2) + '\n', 'utf8');
console.log(`Built ${OUT} from ${properties.length} listings.`);

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

const REQUIRED = ['title', 'acres', 'status', 'county', 'lat', 'lng'];
// A live listing must say where it is. Sold records are archival and the old
// site often recorded only the county, so town is not demanded of them.
const REQUIRED_FOR_SALE = ['city'];

const files = (await readdir(SRC)).filter((f) => f.endsWith('.json')).sort();
if (!files.length) throw new Error(`No listings found in ${SRC}/`);

const properties = [];
const problems = [];

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

  properties.push({
    id,
    title: raw.title,
    acres: Number(raw.acres),
    acresLabel: acresLabel(raw.acres),
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
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    coordsApprox: raw.coordsApprox !== false,
    summary: raw.summary ?? '',
    bullets: raw.bullets ?? [],
    directions: raw.directions ?? '',
    docs: (raw.docs ?? []).filter((d) => d && d.label && d.url),
    images: (raw.images ?? []).filter(Boolean)
  });
}

// A listing with a broken file must not silently vanish from the site.
if (problems.length) {
  console.error('Refusing to rebuild — fix these first:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// Newest first, so the "Recently Listed" row and the map agree on ordering.
properties.sort((a, b) => (a.listed < b.listed ? 1 : a.listed > b.listed ? -1 : a.id.localeCompare(b.id)));

await writeFile(OUT, JSON.stringify(properties, null, 2) + '\n', 'utf8');
console.log(`Built ${OUT} from ${properties.length} listings.`);

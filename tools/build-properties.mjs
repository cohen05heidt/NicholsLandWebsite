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

/** 149500 -> "$149,500";  null/blank -> "Call for Price". */
const priceLabel = (price) =>
  price === null || price === undefined || price === ''
    ? 'Call for Price'
    : `$${Number(price).toLocaleString('en-US')}`;

const REQUIRED = ['title', 'acres', 'status', 'county', 'city', 'lat', 'lng'];

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

  const missing = REQUIRED.filter((k) => raw[k] === undefined || raw[k] === '');
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
    priceLabel: priceLabel(price),
    status: raw.status,
    featured: Boolean(raw.featured),
    county: raw.county,
    state: raw.state || 'GA',
    city: raw.city,
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

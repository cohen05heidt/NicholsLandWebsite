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
 * publishing a site with a building silently missing from it.
 *
 * Run locally with:  node tools/build-commercial.mjs
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'data/commercial';
const OUT = 'data/commercial.json';

/** 850000 -> "$850,000";  null/blank -> "Call for Price". A sold building
 *  shows "Sold", for the same reason a sold tract does: there is nothing left
 *  to quote, and a price on a closed sale invites calls about it. */
const priceLabel = (price, status) => {
  if (status === 'Sold') return 'Sold';
  return price === null || price === undefined || price === ''
    ? 'Call for Price'
    : `$${Number(price).toLocaleString('en-US')}`;
};

const REQUIRED = ['title', 'status', 'address', 'image'];

const files = (await readdir(SRC)).filter((f) => f.endsWith('.json')).sort();

const listings = [];
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

  listings.push({
    id,
    title: raw.title,
    status: raw.status,
    price,
    priceLabel: priceLabel(price, raw.status),
    address: raw.address,
    // Both halves are needed: a fact with a label and no value renders as a
    // heading over nothing.
    facts: (raw.facts ?? []).filter((f) => f && f.label && f.value),
    image: raw.image,
    // Falling back to the title keeps the alt text useful rather than empty
    // if someone adds a building and skips the description field.
    alt: raw.alt || raw.title,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 999,
  });
}

if (problems.length) {
  console.error('Refusing to rebuild — fix these first:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// Explicit order first, then title, so the sequence on the page is something
// a person chooses rather than an accident of filenames.
listings.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

await writeFile(OUT, JSON.stringify(listings, null, 2) + '\n', 'utf8');
console.log(`Built ${OUT} from ${listings.length} listings.`);

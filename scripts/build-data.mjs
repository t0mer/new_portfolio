#!/usr/bin/env node
// Build-time data pipeline: collect live stats → data.json.
// Fetch/merge logic lives in ../lib/collect.mjs (shared with the live function).
//
//   - Never blank a section: missing fresh values fall back to the previous
//     data.json (mergeData).
//   - Only rewrite when something other than `generatedAt` changed.
//
// Env: GITHUB_TOKEN optional (raises the REST rate limit; not required).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { collectAll, mergeData } from '../lib/collect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const USER = 't0mer';

async function readJson(name, fallback) {
  try { return JSON.parse(await readFile(join(ROOT, name), 'utf8')); }
  catch { return fallback; }
}

async function main() {
  const prev = await readJson('data.json', {});
  const featuredCfg = await readJson('featured.json', []);

  // Featured base: hand-maintained name/tech/blurb, with last-known stars/dates
  // from the previous build so a failed refresh doesn't zero a card.
  const prevByName = Object.fromEntries((prev.featured || []).map((f) => [f.name, f]));
  const base = featuredCfg.map((f) => {
    const p = prevByName[f.name] || {};
    return {
      name: f.name,
      tech: f.tech || [],
      blurb: f.blurb || '',
      url: f.url || 'https://github.com/' + USER + '/' + f.name,
      stars: typeof p.stars === 'number' ? p.stars : 0,
      pushedAt: p.pushedAt || null,
    };
  });

  const fresh = await collectAll(base, { token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '' });
  const merged = mergeData(fresh, prev);

  const { generatedAt: _drop, ...prevCmp } = prev;
  if (JSON.stringify(prevCmp) === JSON.stringify(merged)) {
    console.log('data.json unchanged — not rewriting.');
    return;
  }

  const out = { generatedAt: new Date().toISOString(), ...merged };
  await writeFile(join(ROOT, 'data.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('data.json written.');
}

main().catch((e) => { console.error(e); process.exit(1); });

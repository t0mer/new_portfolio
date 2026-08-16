#!/usr/bin/env node
// Tiny build step: render templates/index.html with data.json → index.html.
// No framework. Produces complete, populated HTML so first paint needs no fetch.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const compact = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
const commas = (n) => Number(n).toLocaleString('en-US');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

function relTime(iso, now) {
  if (!iso) return '';
  const then = new Date(iso);
  if (isNaN(then)) return '';
  const days = Math.floor((now - then) / 86400000);
  if (days <= 0) return 'updated today';
  if (days === 1) return 'updated yesterday';
  if (days < 7) return 'updated ' + days + ' days ago';
  if (days < 14) return 'updated last week';
  if (days < 60) return 'updated ' + Math.floor(days / 7) + ' weeks ago';
  if (days < 365) return 'updated ' + Math.floor(days / 30) + ' months ago';
  const y = Math.floor(days / 365);
  return 'updated ' + y + (y === 1 ? ' year ago' : ' years ago');
}

function figures(profile) {
  const items = [
    { value: compact(profile.publicRepos || 0), label: 'Public repos' },
    { value: compact(profile.totalStars || 0), label: 'Stars earned' },
    { value: commas(profile.contributionsLastYear || 0), label: 'Contributions' },
  ];
  return items.map((it) =>
    '<div class="figure-item"><span class="figure-value">' + esc(it.value) +
    '</span><span class="figure-label">' + esc(it.label) + '</span></div>'
  ).join('\n            ');
}

function workCards(featured, now) {
  return featured.map((f) => {
    const meta = '★ ' + compact(f.stars || 0) + ' · ' + relTime(f.pushedAt, now);
    return (
      '<a class="card elev-sm" href="' + esc(f.url) + '">\n' +
      '            <span class="card-kicker">' + esc((f.tech || []).join(' · ')) + '</span>\n' +
      '            <span class="card-title">' + esc(f.name) + '</span>\n' +
      '            <p class="card-body">' + esc(f.blurb || '') + '</p>\n' +
      '            <span class="card-meta">' + esc(meta) + '</span>\n' +
      '          </a>'
    );
  }).join('\n          ');
}

function posts(list) {
  return list.map((p) =>
    '<a class="post-row" href="' + esc(p.url) + '">\n' +
    '            <span class="post-date">' + esc(fmtDate(p.publishedAt)) + '</span>\n' +
    '            <span class="post-title">' + esc(p.title) + '</span>\n' +
    '            <span class="post-read">' + esc(p.readingMinutes || 1) + ' min</span>\n' +
    '          </a>'
  ).join('\n          ');
}

function activityCells(weeks) {
  const max = Math.max(1, ...weeks);
  return weeks.map((w) => {
    let level = 0;
    if (w > 0) level = w <= max / 3 ? 1 : (w <= (2 * max) / 3 ? 2 : 3);
    return '<span class="act-cell l' + level + '" title="' + w + ' contributions"></span>';
  }).join('\n            ');
}

async function main() {
  const [tpl, data] = await Promise.all([
    readFile(join(ROOT, 'templates', 'index.html'), 'utf8'),
    readFile(join(ROOT, 'data.json'), 'utf8').then(JSON.parse),
  ]);

  const now = Date.now();
  const profile = data.profile || {};
  const weeks = Array.isArray(data.weeks) ? data.weeks : [];

  const caption =
    '<span>Last ' + weeks.length + ' weeks</span>' +
    '<span>' + commas(profile.contributionsLastYear || 0) + ' contributions</span>';

  const html = tpl
    .replace('<!--FIGURES-->', figures(profile))
    .replace('<!--REPO_COUNT-->', esc(profile.publicRepos || 0))
    .replace('<!--WORK_CARDS-->', workCards(data.featured || [], now))
    .replace('<!--POSTS-->', posts(data.posts || []))
    .replace('<!--ACTIVITY_CELLS-->', activityCells(weeks))
    .replace('<!--ACTIVITY_CAPTION-->', caption)
    .replace('<!--YEAR-->', String(new Date(now).getUTCFullYear()));

  await writeFile(join(ROOT, 'index.html'), html);
  console.log('index.html built.');
}

main().catch((e) => { console.error(e); process.exit(1); });

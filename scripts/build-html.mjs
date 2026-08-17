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
const compactNum = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(n);
};

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

const ICON_BRANCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>';
const ICON_STAR = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

function figures(profile) {
  const items = [
    { value: compact(profile.publicRepos || 0), label: 'Public repos' },
    { value: compact(profile.totalStars || 0), label: 'Stars earned' },
    { value: commas(profile.contributionsLastYear || 0), label: 'Contributions' },
  ];
  return items.map((it) =>
    '<div class="about-fig"><b>' + esc(it.value) + '</b><span>' + esc(it.label) + '</span></div>'
  ).join('\n            ');
}

function projects(featured, now) {
  return featured.map((f) => (
    '<a class="proj-card" href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">\n' +
    '          <div class="proj-top">' + ICON_BRANCH +
    '<span class="proj-stars">' + ICON_STAR + ' ' + compact(f.stars || 0) + '</span></div>\n' +
    '          <div class="proj-body">\n' +
    '            <span class="proj-kicker">' + esc((f.tech || []).join(' · ')) + '</span>\n' +
    '            <span class="proj-title">' + esc(f.name) + '</span>\n' +
    '            <p class="proj-desc">' + esc(f.blurb || '') + '</p>\n' +
    '            <span class="proj-meta">' + esc(relTime(f.pushedAt, now)) + '</span>\n' +
    '          </div>\n' +
    '        </a>'
  )).join('\n        ');
}

function posts(list) {
  return list.map((p) => (
    '<a class="blog-card" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">\n' +
    '          <span class="blog-date">' + esc(fmtDate(p.publishedAt)) + '</span>\n' +
    '          <span class="blog-title">' + esc(p.title) + '</span>\n' +
    '          <span class="blog-read">' + esc(p.readingMinutes || 1) + ' min read</span>\n' +
    '        </a>'
  )).join('\n        ');
}

function activityStats(profile) {
  const tiles = [
    { v: commas(profile.contributionsLastYear || 0), l: 'Contributions · year' },
    { v: commas(profile.currentStreak || 0), l: 'Current streak · days' },
    { v: commas(profile.longestStreak || 0), l: 'Longest streak · days' },
  ];
  return tiles.map((t) =>
    '<div class="stat-tile"><b>' + esc(t.v) + '</b><span>' + esc(t.l) + '</span></div>'
  ).join('\n        ');
}

function dockerStats(docker) {
  docker = docker || {};
  const tiles = [
    { v: commas(docker.images || 0), l: 'Docker images' },
    { v: commas(docker.stars || 0), l: 'Docker stars' },
    { v: compactNum(docker.pulls || 0), l: 'Total pulls' },
  ];
  return tiles.map((t) =>
    '<div class="stat-tile"><b>' + esc(t.v) + '</b><span>' + esc(t.l) + '</span></div>'
  ).join('\n        ');
}

function activityCells(weeks) {
  const max = Math.max(1, ...weeks);
  return weeks.map((w) => {
    let level = 0;
    if (w > 0) level = w <= max * 0.25 ? 1 : w <= max * 0.5 ? 2 : w <= max * 0.75 ? 3 : 4;
    return '<span class="strip-cell l' + level + '" title="' + w + ' contributions"></span>';
  }).join('');
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
    .replace(/<!--REPO_COUNT-->/g, esc(profile.publicRepos || 0))
    .replace('<!--ACTIVITY_STATS-->', activityStats(profile))
    .replace('<!--ACTIVITY_CELLS-->', activityCells(weeks))
    .replace('<!--ACTIVITY_CAPTION-->', caption)
    .replace('<!--DOCKER_STATS-->', dockerStats(data.docker))
    .replace('<!--PROJECTS-->', projects(data.featured || [], now))
    .replace('<!--POSTS-->', posts(data.posts || []))
    .replace(/<!--YEAR-->/g, String(new Date(now).getUTCFullYear()));

  await writeFile(join(ROOT, 'index.html'), html);
  console.log('index.html built.');
}

main().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
// Build-time data pipeline for the portfolio.
//
// Produces a single committed `data.json` from:
//   - GitHub REST → publicRepos, followers, totalStars, per-featured-repo stars/pushedAt
//   - GitHub public contributions HTML → contributionsLastYear + weekly counts
//   - Medium RSS  → recent posts (title, url, date, reading minutes)
//   - featured.json → the hand-maintained repo list + blurbs (never overwritten here)
//
// Design rules (see design_handoff_portfolio_refresh/README.md):
//   - Never blank a section: if a source can't be fetched, keep the previous
//     value from the existing data.json.
//   - Only rewrite data.json when something other than `generatedAt` changed,
//     so the daily Action doesn't churn commits.
//
// Env: GITHUB_TOKEN (optional; only raises the REST rate limit. Contributions,
// repos, posts all work token-free — the whole pipeline runs without secrets).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const USER = 't0mer';
const DOCKER_USER = 'techblog';
const MEDIUM_FEED = 'https://medium.com/feed/@tomer.klein';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const MAX_POSTS = 5;
const WEEKS = 26;

const ghHeaders = {
  'User-Agent': 'tomer-portfolio-build',
  Accept: 'application/vnd.github+json',
  ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
};

const ghREST = (path) => fetch('https://api.github.com' + path, { headers: ghHeaders });

async function getProfileAndStars() {
  const res = await ghREST('/users/' + USER);
  if (!res.ok) throw new Error('users: ' + res.status);
  const user = await res.json();

  let totalStars = 0;
  for (let page = 1; page <= 6; page++) {
    const r = await ghREST('/users/' + USER + '/repos?per_page=100&sort=updated&page=' + page);
    if (!r.ok) break;
    const repos = await r.json();
    if (!Array.isArray(repos) || repos.length === 0) break;
    totalStars += repos.reduce((s, x) => s + (x.stargazers_count || 0), 0);
    if (repos.length < 100) break;
  }

  return {
    publicRepos: user.public_repos || 0,
    followers: user.followers || 0,
    totalStars,
  };
}

// Public contributions calendar — parsed from github.com/users/<u>/contributions.
// Each day is a <tool-tip for="contribution-day-component-{weekday}-{week}">
// "N contributions on …". Grouping the counts by the {week} index gives weekly
// totals; summing all gives the year. No token required.
async function getContributions() {
  try {
    const res = await fetch('https://github.com/users/' + USER + '/contributions', {
      headers: { 'User-Agent': 'tomer-portfolio-build', Accept: 'text/html' },
    });
    if (!res.ok) return { contributionsLastYear: null, weeks: null };
    const html = await res.text();
    const re = /<tool-tip[^>]*for="contribution-day-component-\d+-(\d+)"[^>]*>([^<]*)<\/tool-tip>/g;
    const cols = {};
    let total = 0;
    let m;
    while ((m = re.exec(html))) {
      const week = Number(m[1]);
      const num = /^No contributions/i.test(m[2]) ? 0 : parseInt((m[2].match(/^([\d,]+)/) || ['', '0'])[1].replace(/,/g, ''), 10) || 0;
      cols[week] = (cols[week] || 0) + num;
      total += num;
    }
    const weekly = Object.keys(cols).map(Number).sort((a, b) => a - b).map((i) => cols[i]);
    if (weekly.length === 0) return { contributionsLastYear: null, weeks: null, currentStreak: null, longestStreak: null };

    // Daily active flags (date + level>0) for streaks. Cells are laid out
    // row-major (by weekday), so sort by date before scanning.
    const days = [];
    const cre = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="(\d+)"/g;
    let c;
    while ((c = cre.exec(html))) days.push({ date: c[1], active: Number(c[2]) > 0 });
    days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let longest = 0, run = 0;
    for (const d of days) { if (d.active) { run++; if (run > longest) longest = run; } else run = 0; }

    // Current streak, allowing today itself to have no contributions yet.
    let current = 0, i = days.length - 1;
    if (i >= 0 && !days[i].active) i--;
    for (; i >= 0 && days[i].active; i--) current++;

    return { contributionsLastYear: total, weeks: weekly, currentStreak: current, longestStreak: longest };
  } catch {
    return { contributionsLastYear: null, weeks: null, currentStreak: null, longestStreak: null };
  }
}

async function getFeatured() {
  const featured = JSON.parse(await readFile(join(ROOT, 'featured.json'), 'utf8'));
  const out = [];
  for (const f of featured) {
    const item = {
      name: f.name,
      url: f.url || 'https://github.com/' + USER + '/' + f.name,
      blurb: f.blurb || '',
      tech: f.tech || [],
      stars: typeof f.stars === 'number' ? f.stars : 0,
      pushedAt: f.pushedAt || null,
    };
    try {
      const r = await ghREST('/repos/' + USER + '/' + f.name);
      if (r.ok) {
        const repo = await r.json();
        if (typeof repo.stargazers_count === 'number') {
          item.stars = repo.stargazers_count;
          item.pushedAt = repo.pushed_at;
        }
      }
    } catch { /* keep the hand-maintained/previous values */ }
    out.push(item);
  }
  return out;
}

function pickTag(chunk, tag) {
  const m = chunk.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}

async function getPosts() {
  const res = await fetch(MEDIUM_FEED, { headers: { 'User-Agent': 'tomer-portfolio-build' } });
  if (!res.ok) throw new Error('medium: ' + res.status);
  const xml = await res.text();
  const items = xml.split('<item>').slice(1);
  const posts = items.map((chunk) => {
    const title = pickTag(chunk, 'title');
    const url = pickTag(chunk, 'link').split('?')[0];
    const pub = pickTag(chunk, 'pubDate');
    const content = pickTag(chunk, 'content:encoded');
    const words = content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const readingMinutes = Math.max(1, Math.round(words / 200));
    const d = new Date(pub);
    return {
      title,
      url,
      publishedAt: isNaN(d) ? null : d.toISOString().slice(0, 10),
      readingMinutes,
    };
  }).filter((p) => p.title && p.url);
  return posts.slice(0, MAX_POSTS);
}

// Docker Hub — image count, total stars and total pulls across all repos in
// the namespace. Public API, no auth.
async function getDockerHub() {
  try {
    let url = 'https://hub.docker.com/v2/repositories/' + DOCKER_USER + '/?page_size=100';
    let count = null, stars = 0, pulls = 0;
    for (let i = 0; i < 6 && url; i++) {
      const res = await fetch(url, { headers: { 'User-Agent': 'tomer-portfolio-build' } });
      if (!res.ok) break;
      const j = await res.json();
      if (count === null) count = j.count;
      for (const r of (j.results || [])) { stars += r.star_count || 0; pulls += r.pull_count || 0; }
      url = j.next || null;
    }
    if (count === null) return { images: null, stars: null, pulls: null };
    return { images: count, stars, pulls };
  } catch {
    return { images: null, stars: null, pulls: null };
  }
}

// Retain the previous value when a freshly-fetched one is missing/empty.
function keep(fresh, prev, isEmpty) {
  return isEmpty(fresh) ? (prev === undefined ? fresh : prev) : fresh;
}

async function readPrevious() {
  try { return JSON.parse(await readFile(join(ROOT, 'data.json'), 'utf8')); }
  catch { return {}; }
}

async function main() {
  const prev = await readPrevious();

  let profile = {};
  try { profile = await getProfileAndStars(); }
  catch (e) { console.error('profile fetch failed:', e.message); profile = prev.profile || {}; }

  const contrib = await getContributions().catch(() => ({ contributionsLastYear: null, weeks: null, currentStreak: null, longestStreak: null }));
  const docker = await getDockerHub().catch(() => ({ images: null, stars: null, pulls: null }));
  const prevProfile = prev.profile || {};
  const prevDocker = prev.docker || {};

  const merged = {
    profile: {
      publicRepos: profile.publicRepos || prevProfile.publicRepos || 0,
      followers: profile.followers || prevProfile.followers || 0,
      totalStars: profile.totalStars || prevProfile.totalStars || 0,
      contributionsLastYear: keep(contrib.contributionsLastYear, prevProfile.contributionsLastYear, (v) => v == null),
      currentStreak: keep(contrib.currentStreak, prevProfile.currentStreak, (v) => v == null),
      longestStreak: keep(contrib.longestStreak, prevProfile.longestStreak, (v) => v == null),
    },
    docker: {
      images: keep(docker.images, prevDocker.images, (v) => v == null),
      stars: keep(docker.stars, prevDocker.stars, (v) => v == null),
      pulls: keep(docker.pulls, prevDocker.pulls, (v) => v == null),
    },
    featured: await getFeatured().catch((e) => { console.error('featured failed:', e.message); return prev.featured || []; }),
    weeks: keep(contrib.weeks, prev.weeks, (v) => !Array.isArray(v) || v.length === 0),
    posts: await getPosts().catch((e) => { console.error('posts failed:', e.message); return prev.posts || []; }),
  };

  // Change detection: compare everything except generatedAt.
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

#!/usr/bin/env node
// Build-time data pipeline for the portfolio.
//
// Produces a single committed `data.json` from:
//   - GitHub REST   → publicRepos, followers, totalStars, per-featured-repo stars/pushedAt
//   - GitHub GraphQL → contributionsLastYear + weekly counts (needs a token)
//   - Medium RSS    → recent posts (title, url, date, reading minutes)
//   - featured.json → the hand-maintained repo list + blurbs (never overwritten here)
//
// Design rules (see design_handoff_portfolio_refresh/README.md):
//   - Never blank a section: if a source can't be fetched, keep the previous
//     value from the existing data.json.
//   - Only rewrite data.json when something other than `generatedAt` changed,
//     so the daily Action doesn't churn commits.
//
// Env: GITHUB_TOKEN (Actions provides it; contributions need it).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const USER = 't0mer';
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

async function getContributions() {
  if (!TOKEN) return { contributionsLastYear: null, weeks: null };
  const query = 'query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{contributionCount}}}}}}';
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  if (!res.ok) return { contributionsLastYear: null, weeks: null };
  const json = await res.json();
  const cal = json && json.data && json.data.user && json.data.user.contributionsCollection
    && json.data.user.contributionsCollection.contributionCalendar;
  if (!cal) return { contributionsLastYear: null, weeks: null };
  const weekly = cal.weeks.map((w) => w.contributionDays.reduce((s, d) => s + d.contributionCount, 0));
  return { contributionsLastYear: cal.totalContributions, weeks: weekly.slice(-WEEKS) };
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

  const contrib = await getContributions().catch(() => ({ contributionsLastYear: null, weeks: null }));
  const prevProfile = prev.profile || {};

  const merged = {
    profile: {
      publicRepos: profile.publicRepos || prevProfile.publicRepos || 0,
      followers: profile.followers || prevProfile.followers || 0,
      totalStars: profile.totalStars || prevProfile.totalStars || 0,
      contributionsLastYear: keep(contrib.contributionsLastYear, prevProfile.contributionsLastYear, (v) => v == null),
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

// Shared data collectors: fetch live stats from GitHub, Docker Hub, the Israel
// leaderboard and Medium. Used by the build step (scripts/build-data.mjs, no
// caching) and the live Cloudflare function (functions/api/data.js, with edge
// caching). Each collector takes an `opts` = { token?, cf? }:
//   - token: optional GitHub token (raises REST rate limit; not required).
//   - cf: Cloudflare fetch cache options, e.g. { cacheTtl, cacheEverything }.
//     Node's fetch ignores it; on Workers it caches the upstream response at the
//     edge — that's what keeps live requests from ever hitting rate limits.

const USER = 't0mer';
const DOCKER_USER = 'techblog';
const MEDIUM_FEED = 'https://medium.com/feed/@tomer.klein';
const ISRAEL_LIST = 'https://raw.githubusercontent.com/gayanvoice/top-github-users/main/markdown/public_contributions/israel.md';
const MAX_POSTS = 6;
const UA = 'tomer-portfolio';

function ff(url, opts, headers) {
  return fetch(url, { headers: { 'User-Agent': UA, ...(headers || {}) }, cf: opts.cf });
}
function ghREST(path, opts) {
  const headers = { Accept: 'application/vnd.github+json', ...(opts.token ? { Authorization: 'Bearer ' + opts.token } : {}) };
  return ff('https://api.github.com' + path, opts, headers);
}

export async function getProfileAndStars(opts) {
  const res = await ghREST('/users/' + USER, opts);
  if (!res.ok) return { publicRepos: null, followers: null, totalStars: null };
  const user = await res.json();
  let totalStars = 0, ok = false;
  for (let page = 1; page <= 6; page++) {
    const r = await ghREST('/users/' + USER + '/repos?per_page=100&sort=updated&page=' + page, opts);
    if (!r.ok) break;
    const repos = await r.json();
    if (!Array.isArray(repos) || repos.length === 0) break;
    ok = true;
    totalStars += repos.reduce((s, x) => s + (x.stargazers_count || 0), 0);
    if (repos.length < 100) break;
  }
  return {
    publicRepos: user.public_repos ?? null,
    followers: user.followers ?? null,
    totalStars: ok ? totalStars : null,
  };
}

// Contribution calendar parsed from the profile's own contributions fragment
// (?action=show&controller=profiles&tab=contributions) — this matches the count
// shown on github.com/<user> exactly. (The /users/<u>/contributions endpoint
// serves a slightly staler count.)
export async function getContributions(opts) {
  const empty = { contributionsLastYear: null, weeks: null, currentStreak: null, longestStreak: null };
  try {
    const url = 'https://github.com/' + USER + '?action=show&controller=profiles&tab=contributions&user_id=' + USER;
    const res = await ff(url, opts, { Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' });
    if (!res.ok) return empty;
    const html = await res.text();
    const re = /<tool-tip[^>]*for="contribution-day-component-\d+-(\d+)"[^>]*>([^<]*)<\/tool-tip>/g;
    const cols = {};
    let total = 0, m;
    while ((m = re.exec(html))) {
      const week = Number(m[1]);
      const num = /^No contributions/i.test(m[2]) ? 0 : parseInt((m[2].match(/^([\d,]+)/) || ['', '0'])[1].replace(/,/g, ''), 10) || 0;
      cols[week] = (cols[week] || 0) + num;
      total += num;
    }
    const weekly = Object.keys(cols).map(Number).sort((a, b) => a - b).map((i) => cols[i]);
    if (weekly.length === 0) return empty;

    const days = [];
    const cre = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="(\d+)"/g;
    let c;
    while ((c = cre.exec(html))) days.push({ date: c[1], active: Number(c[2]) > 0 });
    days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let longest = 0, run = 0;
    for (const d of days) { if (d.active) { run++; if (run > longest) longest = run; } else run = 0; }
    let current = 0, i = days.length - 1;
    if (i >= 0 && !days[i].active) i--;
    for (; i >= 0 && days[i].active; i--) current++;

    return { contributionsLastYear: total, weeks: weekly, currentStreak: current, longestStreak: longest };
  } catch { return empty; }
}

// Refresh per-repo stars/pushedAt over a base list, keeping base values on
// failure. `base` items carry name/url/blurb/tech and last-known stars/pushedAt.
export async function getFeatured(base, opts) {
  const out = [];
  for (const f of (base || [])) {
    const item = {
      name: f.name,
      url: f.url || 'https://github.com/' + USER + '/' + f.name,
      blurb: f.blurb || '',
      tech: f.tech || [],
      stars: typeof f.stars === 'number' ? f.stars : 0,
      pushedAt: f.pushedAt || null,
    };
    try {
      const r = await ghREST('/repos/' + USER + '/' + f.name, opts);
      if (r.ok) {
        const repo = await r.json();
        if (typeof repo.stargazers_count === 'number') { item.stars = repo.stargazers_count; item.pushedAt = repo.pushed_at; }
      }
    } catch { /* keep base values */ }
    out.push(item);
  }
  return out;
}

function pickTag(chunk, tag) {
  const m = chunk.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}
export async function getPosts(opts) {
  try {
    const res = await ff(MEDIUM_FEED, opts);
    if (!res.ok) return null;
    const xml = await res.text();
    const items = xml.split('<item>').slice(1);
    const list = items.map((chunk) => {
      const title = pickTag(chunk, 'title');
      const url = pickTag(chunk, 'link').split('?')[0];
      const pub = pickTag(chunk, 'pubDate');
      const content = pickTag(chunk, 'content:encoded');
      const words = content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      const d = new Date(pub);
      return { title, url, publishedAt: isNaN(d) ? null : d.toISOString().slice(0, 10), readingMinutes: Math.max(1, Math.round(words / 200)) };
    }).filter((p) => p.title && p.url);
    return list.length ? list.slice(0, MAX_POSTS) : null;
  } catch { return null; }
}

export async function getDockerHub(opts) {
  try {
    let url = 'https://hub.docker.com/v2/repositories/' + DOCKER_USER + '/?page_size=100';
    let count = null, stars = 0, pulls = 0;
    for (let i = 0; i < 6 && url; i++) {
      const res = await ff(url, opts);
      if (!res.ok) break;
      const j = await res.json();
      if (count === null) count = j.count;
      for (const r of (j.results || [])) { stars += r.star_count || 0; pulls += r.pull_count || 0; }
      url = j.next || null;
    }
    if (count === null) return { images: null, stars: null, pulls: null };
    return { images: count, stars, pulls };
  } catch { return { images: null, stars: null, pulls: null }; }
}

export async function getIsraelRank(opts) {
  try {
    const res = await ff(ISRAEL_LIST, opts);
    if (!res.ok) return null;
    const md = await res.text();
    const idx = md.indexOf('href="https://github.com/' + USER + '"');
    if (idx === -1) return null;
    const tds = md.slice(0, idx).match(/<td>(\d+)<\/td>/g);
    if (!tds || tds.length === 0) return null;
    const rank = parseInt(tds[tds.length - 1].replace(/\D/g, ''), 10);
    const total = (md.match(/alt="Avatar of/g) || []).length;
    if (!rank || !total) return null;
    return { rank, total };
  } catch { return null; }
}

// Fetch everything concurrently. Returns fresh values (null on failure);
// callers fill nulls from a previous snapshot with mergeData().
export async function collectAll(featuredBase, opts = {}) {
  opts = { token: opts.token || '', cf: opts.cf };
  const [profile, contrib, docker, israelRank, featured, posts] = await Promise.all([
    getProfileAndStars(opts).catch(() => ({ publicRepos: null, followers: null, totalStars: null })),
    getContributions(opts),
    getDockerHub(opts),
    getIsraelRank(opts),
    getFeatured(featuredBase, opts).catch(() => null),
    getPosts(opts),
  ]);
  return {
    profile: {
      publicRepos: profile.publicRepos,
      followers: profile.followers,
      totalStars: profile.totalStars,
      contributionsLastYear: contrib.contributionsLastYear,
      currentStreak: contrib.currentStreak,
      longestStreak: contrib.longestStreak,
    },
    docker,
    israelRank,
    weeks: contrib.weeks,
    featured,
    posts,
  };
}

// Merge fresh over previous: use fresh where present, else keep the previous
// (build-time) value. Same rule used by the build and the live function.
export function mergeData(fresh, prev) {
  prev = prev || {};
  const pp = prev.profile || {}, pd = prev.docker || {};
  const f = fresh || {}, fp = f.profile || {}, fd = f.docker || {};
  const pick = (a, b) => (a != null ? a : (b != null ? b : null));
  return {
    profile: {
      publicRepos: pick(fp.publicRepos, pp.publicRepos) || 0,
      followers: pick(fp.followers, pp.followers) || 0,
      totalStars: pick(fp.totalStars, pp.totalStars) || 0,
      contributionsLastYear: pick(fp.contributionsLastYear, pp.contributionsLastYear),
      currentStreak: pick(fp.currentStreak, pp.currentStreak),
      longestStreak: pick(fp.longestStreak, pp.longestStreak),
    },
    docker: {
      images: pick(fd.images, pd.images),
      stars: pick(fd.stars, pd.stars),
      pulls: pick(fd.pulls, pd.pulls),
    },
    israelRank: (f.israelRank && f.israelRank.rank != null) ? f.israelRank : (prev.israelRank || null),
    weeks: (Array.isArray(f.weeks) && f.weeks.length) ? f.weeks : (prev.weeks || []),
    featured: (Array.isArray(f.featured) && f.featured.length) ? f.featured : (prev.featured || []),
    posts: (Array.isArray(f.posts) && f.posts.length) ? f.posts : (prev.posts || []),
  };
}

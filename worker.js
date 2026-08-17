// Cloudflare Worker entry (Workers Static Assets model).
// Static files serve directly via the ASSETS binding. Two dynamic routes:
//   GET /api/data   — live stat fragments, served from a 3h edge cache
//                     (computed on a miss). What the page hydrates from.
//   GET /api/update — force a refresh: recompute fresh now and overwrite the
//                     cache, so the next /api/data is immediately current.
// Collect/render logic is shared with the build step (lib/), so nothing drifts.
//
// Note: Cloudflare's cache is per edge location, so /api/update refreshes the
// colo that serves the request; other regions refresh on their own 3h expiry.

import { collectAll, mergeData } from './lib/collect.mjs';
import { renderFragments } from './lib/render.mjs';

const TTL = 10800; // 3 hours
const CACHE_KEY = '/__stats-cache-v1';

function jsonResponse(fragments, cacheState) {
  return new Response(JSON.stringify(fragments), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=' + TTL,
      'X-Stats-Cache': cacheState,
    },
  });
}

// Fresh compute — no upstream caching, so the numbers are current.
async function computeFragments(request, env) {
  let snapshot = {};
  try {
    const r = await env.ASSETS.fetch(new URL('/data.json', request.url));
    if (r.ok) snapshot = await r.json();
  } catch { /* no snapshot — fall back to whatever collectors return */ }

  const token = (env && env.GITHUB_TOKEN) || '';
  let merged;
  try {
    const fresh = await collectAll(snapshot.featured || [], { token });
    merged = mergeData(fresh, snapshot);
  } catch {
    merged = mergeData({}, snapshot);
  }
  return renderFragments(merged, Date.now());
}

function cacheKey(request) {
  return new Request(new URL(CACHE_KEY, request.url), { method: 'GET' });
}

// GET /api/data — serve cached fragments (compute + cache on a miss/expiry).
async function apiData(request, env, ctx) {
  const cache = caches.default;
  const key = cacheKey(request);
  const hit = await cache.match(key);
  if (hit) {
    const headers = new Headers(hit.headers);
    headers.set('X-Stats-Cache', 'HIT');
    return new Response(hit.body, { status: hit.status, headers });
  }
  const resp = jsonResponse(await computeFragments(request, env), 'MISS');
  ctx.waitUntil(cache.put(key, resp.clone()));
  return resp;
}

// GET /api/update — recompute fresh and overwrite the cache.
async function apiUpdate(request, env, ctx) {
  const cache = caches.default;
  const resp = jsonResponse(await computeFragments(request, env), 'UPDATED');
  ctx.waitUntil(cache.put(cacheKey(request), resp.clone()));
  return resp;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/data') return apiData(request, env, ctx);
    if (url.pathname === '/api/update') return apiUpdate(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};

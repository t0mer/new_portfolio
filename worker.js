// Cloudflare Worker entry (Workers Static Assets model).
// Static files are served directly by the ASSETS binding; only /api/data runs
// the Worker — live stats, upstream fetches edge-cached ~3h. Collect/render
// logic is shared with the build step (lib/), so nothing drifts.

import { collectAll, mergeData } from './lib/collect.mjs';
import { renderFragments } from './lib/render.mjs';

const CACHE_SECONDS = 10800; // 3 hours

async function apiData(request, env) {
  const cf = { cacheTtl: CACHE_SECONDS, cacheEverything: true };

  // Build-time snapshot (featured base + fallback for any field that fails live).
  let snapshot = {};
  try {
    const r = await env.ASSETS.fetch(new URL('/data.json', request.url));
    if (r.ok) snapshot = await r.json();
  } catch { /* no snapshot */ }

  const token = (env && env.GITHUB_TOKEN) || '';
  let merged;
  try {
    const fresh = await collectAll(snapshot.featured || [], { token, cf });
    merged = mergeData(fresh, snapshot);
  } catch {
    merged = mergeData({}, snapshot);
  }

  return new Response(JSON.stringify(renderFragments(merged, Date.now())), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=' + CACHE_SECONDS + ', max-age=0',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/data') return apiData(request, env);
    return env.ASSETS.fetch(request);
  },
};

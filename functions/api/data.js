// Cloudflare Pages Function — GET /api/data
// Live stats, edge-cached ~3h. Fetches the committed data.json snapshot for the
// featured base + fallback values, refreshes everything live (upstream fetches
// cached at the edge via `cf.cacheTtl`, so traffic never causes rate limits),
// merges fresh-over-snapshot, and returns rendered HTML fragments the client
// injects. Render/collect logic is shared with the build step.

import { collectAll, mergeData } from '../../lib/collect.mjs';
import { renderFragments } from '../../lib/render.mjs';

const CACHE_SECONDS = 10800; // 3 hours

export async function onRequestGet(context) {
  const cf = { cacheTtl: CACHE_SECONDS, cacheEverything: true };

  // Build-time snapshot: featured base (with blurbs) + fallback for any field
  // whose live fetch fails.
  let snapshot = {};
  try {
    const r = await fetch(new URL('/data.json', context.request.url), { cf });
    if (r.ok) snapshot = await r.json();
  } catch { /* no snapshot — collectors still return what they can */ }

  const token = (context.env && context.env.GITHUB_TOKEN) || '';

  let merged;
  try {
    const fresh = await collectAll(snapshot.featured || [], { token, cf });
    merged = mergeData(fresh, snapshot);
  } catch {
    merged = mergeData({}, snapshot); // total failure → serve the snapshot as-is
  }

  const fragments = renderFragments(merged, Date.now());

  return new Response(JSON.stringify(fragments), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=' + CACHE_SECONDS + ', max-age=0',
    },
  });
}

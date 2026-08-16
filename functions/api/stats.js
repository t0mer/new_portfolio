// Cloudflare Pages Function - GET /api/stats
// Returns GitHub account summary (public repos, followers, total stars),
// edge-cached 24h.

var GITHUB_USER = 'https://api.github.com/users/t0mer';
var GITHUB_REPOS = 'https://api.github.com/users/t0mer/repos?per_page=100&sort=updated';
var CACHE_SECONDS = 86400;

export async function onRequestGet() {
  var headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, s-maxage=' + CACHE_SECONDS + ', max-age=' + CACHE_SECONDS,
  };

  var fetchHeaders = {
    'User-Agent': 'tomer-portfolio',
    Accept: 'application/vnd.github+json',
  };

  try {
    var userRes = await fetch(GITHUB_USER, {
      headers: fetchHeaders,
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });

    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'GitHub user request failed' }), {
        status: 502,
        headers: headers,
      });
    }

    var user = await userRes.json();

    // Sum stargazers across every public repo (paginated).
    var totalStars = 0;
    var page = 1;

    while (page <= 5) {
      var url = GITHUB_REPOS + '&page=' + page;
      var res = await fetch(url, {
        headers: fetchHeaders,
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
      });

      if (!res.ok) break;

      var batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;

      for (var i = 0; i < batch.length; i++) {
        totalStars += batch[i].stargazers_count || 0;
      }

      if (batch.length < 100) break;
      page++;
    }

    var stats = {
      public_repos: user.public_repos || 0,
      followers: user.followers || 0,
      total_stars: totalStars,
    };

    return new Response(JSON.stringify(stats), { headers: headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: String(err) }),
      { status: 500, headers: headers }
    );
  }
}

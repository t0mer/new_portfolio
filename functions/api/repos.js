// Cloudflare Pages Function - GET /api/repos
// Returns top 6 most-starred GitHub repos, edge-cached 24h

var GITHUB_API = 'https://api.github.com/users/t0mer/repos?per_page=100&sort=updated';
var CACHE_SECONDS = 86400;

var LANG_COLORS = {
  Python: '#3572A5',
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#563d7c',
  'C#': '#178600',
  Shell: '#89e051',
  Go: '#00ADD8',
  Dockerfile: '#384d54',
  Jupyter: '#DA5B0B',
};

export async function onRequestGet() {
  var headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, s-maxage=' + CACHE_SECONDS + ', max-age=' + CACHE_SECONDS,
  };

  try {
    var fetchHeaders = {
      'User-Agent': 'tomer-portfolio',
      Accept: 'application/vnd.github+json',
    };

    var allRepos = [];
    var page = 1;

    while (page <= 5) {
      var url = GITHUB_API + '&page=' + page;
      var res = await fetch(url, {
        headers: fetchHeaders,
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
      });

      if (!res.ok) break;

      var batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      allRepos = allRepos.concat(batch);
      if (batch.length < 100) break;
      page++;
    }

    if (allRepos.length === 0) {
      return new Response(JSON.stringify({ error: 'No repos returned from GitHub' }), {
        status: 502,
        headers: headers,
      });
    }

    allRepos.sort(function (a, b) {
      return (b.stargazers_count || 0) - (a.stargazers_count || 0);
    });

    var repos = allRepos.slice(0, 8).map(function (r) {
      return {
        name: r.name,
        html_url: r.html_url,
        description: r.description || '',
        stargazers_count: r.stargazers_count || 0,
        forks_count: r.forks_count || 0,
        language: r.language || '',
        language_color: LANG_COLORS[r.language] || '#8b949e',
      };
    });

    return new Response(JSON.stringify({ repos: repos }), { headers: headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: String(err) }),
      { status: 500, headers: headers }
    );
  }
}

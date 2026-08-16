// Cloudflare Pages Function - GET /api/rankings
// Parses the gayanvoice/top-github-users Israel lists and returns this user's
// rank + list size for public contributions, total contributions and followers.
// Edge-cached 24h.

var USERNAME = 't0mer';
var COUNTRY = 'israel';
var BASE = 'https://raw.githubusercontent.com/gayanvoice/top-github-users/main/markdown';
var LISTS = ['public_contributions', 'total_contributions', 'followers'];
var CACHE_SECONDS = 86400;

// Each ranked row is `<tr><td>RANK</td><td><a href="https://github.com/<user>">…`.
// The rank is the last `<td>number</td>` before the user's profile link; the
// list size is the number of avatar rows.
function parseRank(md, username) {
  var marker = 'href="https://github.com/' + username + '"';
  var idx = md.indexOf(marker);
  if (idx === -1) return null;
  var tds = md.slice(0, idx).match(/<td>(\d+)<\/td>/g);
  if (!tds || tds.length === 0) return null;
  var rank = parseInt(tds[tds.length - 1].replace(/\D/g, ''), 10);
  var total = (md.match(/alt="Avatar of/g) || []).length;
  if (!rank || !total) return null;
  return { rank: rank, total: total };
}

export async function onRequestGet() {
  var headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, s-maxage=' + CACHE_SECONDS + ', max-age=' + CACHE_SECONDS,
  };

  try {
    var result = {};

    for (var i = 0; i < LISTS.length; i++) {
      var list = LISTS[i];
      var res = await fetch(BASE + '/' + list + '/' + COUNTRY + '.md', {
        headers: { 'User-Agent': 'tomer-portfolio' },
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
      });

      if (!res.ok) {
        result[list] = null;
        continue;
      }

      var md = await res.text();
      result[list] = parseRank(md, USERNAME);
    }

    return new Response(JSON.stringify(result), { headers: headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: String(err) }),
      { status: 500, headers: headers }
    );
  }
}

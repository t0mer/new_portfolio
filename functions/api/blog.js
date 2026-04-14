// Cloudflare Pages Function - GET /api/blog
// Returns latest 8 Medium articles, edge-cached 24h via Cache-Control + cf fetch options

const MEDIUM_RSS_URL =
  'https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fmedium.com%2Ffeed%2F%40tomer.klein&api_key=lkrtitumusrettnxuylamjlxbff9xhubpzzgbmhn';
const CACHE_SECONDS = 86400;

export async function onRequestGet() {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, s-maxage=' + CACHE_SECONDS + ', max-age=' + CACHE_SECONDS,
  };

  try {
    const res = await fetch(MEDIUM_RSS_URL, {
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Upstream ' + res.status }), {
        status: 502,
        headers: headers,
      });
    }

    var data = await res.json();

    if (data.status !== 'ok' || !data.items) {
      return new Response(JSON.stringify({ error: 'No items from upstream' }), {
        status: 502,
        headers: headers,
      });
    }

    var articles = data.items.slice(0, 8).map(function (item) {
      var imgMatch = item.description
        ? item.description.match(/<img[^>]+src="([^"]+)"/)
        : null;
      var thumbnail = item.thumbnail || (imgMatch ? imgMatch[1] : '');

      return {
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        thumbnail: thumbnail,
        categories: (item.categories || []).slice(0, 4),
      };
    });

    return new Response(JSON.stringify({ items: articles }), { headers: headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: String(err) }),
      { status: 500, headers: headers }
    );
  }
}

/* main.js – Portfolio interactivity */
(function () {
  'use strict';

  /* ========== DOM cache ========== */
  const navLinks       = document.querySelectorAll('.nav-link');
  const sections       = document.querySelectorAll('.content-section');
  const typedSpan      = document.getElementById('typed');
  const sidebar        = document.querySelector('.sidebar');
  const menuToggle     = document.getElementById('menuToggle');
  const overlay        = document.getElementById('sidebarOverlay');
  const blogGrid       = document.getElementById('blogGrid');
  const projectsGrid   = document.getElementById('projectsGrid');
  const counterEls     = document.querySelectorAll('.counter');

  /* ========== Counter Animation ========== */
  let countersDone = false;

  function animateCounters() {
    if (countersDone) return;
    countersDone = true;

    counterEls.forEach(el => {
      const target = parseInt(el.getAttribute('data-target'), 10);
      const duration = 1600;
      const start = performance.now();

      function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(ease * target);
        if (progress < 1) requestAnimationFrame(step);
      }

      requestAnimationFrame(step);
    });
  }

  /* ========== Section Navigation ========== */
  function activateSection(id) {
    sections.forEach(s => s.classList.remove('active'));
    navLinks.forEach(l => l.classList.remove('active'));

    const target = document.getElementById(id);
    if (target) target.classList.add('active');

    navLinks.forEach(l => {
      if (l.getAttribute('data-section') === id) l.classList.add('active');
    });

    closeMobileMenu();

    /* start counter animation if about section */
    if (id === 'about') animateCounters();
  }

  /* Navigate via hash — lets the browser update the URL */
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      /* Don't preventDefault — let the browser set the hash natively */
    });
  });

  /* React to hash changes (back/forward, direct links) */
  function onHashChange() {
    const hash = window.location.hash.replace('#', '') || 'about';
    activateSection(hash);
  }

  window.addEventListener('hashchange', onHashChange);

  /* On initial load, activate the section from the URL hash */
  onHashChange();

  /* ========== Mobile Menu ========== */
  function closeMobileMenu() {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('show');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeMobileMenu);
  }

  /* ========== Typing Animation ========== */
  const roles = [
    'Python Developer',
    'IoT Innovator',
    'Open Source Enthusiast',
    'Docker Advocate',
    'Home Automation Geek',
    'Security Researcher'
  ];

  let roleIdx = 0;
  let charIdx = 0;
  let deleting = false;

  function typeLoop() {
    if (!typedSpan) return;
    const word = roles[roleIdx];

    if (!deleting) {
      typedSpan.textContent = word.slice(0, charIdx + 1);
      charIdx++;
      if (charIdx === word.length) {
        deleting = true;
        setTimeout(typeLoop, 1800);
        return;
      }
      setTimeout(typeLoop, 80);
    } else {
      typedSpan.textContent = word.slice(0, charIdx - 1);
      charIdx--;
      if (charIdx === 0) {
        deleting = false;
        roleIdx = (roleIdx + 1) % roles.length;
        setTimeout(typeLoop, 400);
        return;
      }
      setTimeout(typeLoop, 40);
    }
  }

  typeLoop();

  /* ========== Helpers ========== */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /* ========== Fallback URLs (direct public APIs) ========== */
  var BLOG_FALLBACK =
    'https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fmedium.com%2Ffeed%2F%40tomer.klein';
  var REPOS_FALLBACK =
    'https://api.github.com/users/t0mer/repos?per_page=100&sort=updated';
  var USER_FALLBACK =
    'https://api.github.com/users/t0mer';
  var RANK_USER = 't0mer';
  var RANK_COUNTRY = 'israel';
  var RANK_BASE =
    'https://raw.githubusercontent.com/gayanvoice/top-github-users/main/markdown';
  var RANK_LISTS = ['public_contributions', 'total_contributions', 'followers'];

  var LANG_COLORS = {
    Python: '#3572A5', JavaScript: '#f1e05a', TypeScript: '#3178c6',
    HTML: '#e34c26', CSS: '#563d7c', 'C#': '#178600', Shell: '#89e051',
    Go: '#00ADD8', Dockerfile: '#384d54', Jupyter: '#DA5B0B'
  };

  /* ========== Blog ========== */
  var isLocal = window.location.protocol === 'file:';

  function renderBlogs(items) {
    if (!blogGrid) return;
    blogGrid.innerHTML = '';

    items.forEach(function (item) {
      var thumb = item.thumbnail || '';
      var tags = (item.categories || []).slice(0, 4);
      var card = document.createElement('a');
      card.href = item.link;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.className = 'blog-card';
      card.innerHTML =
        (thumb ? '<img class="blog-thumb" src="' + encodeURI(thumb) + '" alt="" loading="lazy">' : '') +
        '<div class="blog-body">' +
          '<div class="blog-meta"><i class="fa-regular fa-calendar"></i> ' + formatDate(item.pubDate) + '</div>' +
          '<div class="blog-title">' + escapeHtml(item.title) + '</div>' +
          '<div class="blog-tags">' + tags.map(function (t) { return '<span class="blog-tag">' + escapeHtml(t) + '</span>'; }).join('') + '</div>' +
        '</div>';
      blogGrid.appendChild(card);
    });
  }

  function loadBlogFromFallback() {
    return fetch(BLOG_FALLBACK)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.status === 'ok' && data.items && data.items.length) {
          var articles = data.items.slice(0, 8).map(function (item) {
            var imgMatch = item.description ? item.description.match(/<img[^>]+src="([^"]+)"/) : null;
            return {
              title: item.title,
              link: item.link,
              pubDate: item.pubDate,
              thumbnail: item.thumbnail || (imgMatch ? imgMatch[1] : ''),
              categories: (item.categories || []).slice(0, 4),
            };
          });
          renderBlogs(articles);
        } else {
          blogGrid.innerHTML = '<p class="blog-loading">Unable to load blog posts.</p>';
        }
      });
  }

  if (isLocal) {
    loadBlogFromFallback().catch(function () {
      if (blogGrid) blogGrid.innerHTML = '<p class="blog-loading">Unable to load blog posts.</p>';
    });
  } else {
    fetch('/api/blog')
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (data) {
        if (data.items && data.items.length) {
          renderBlogs(data.items);
        } else {
          return loadBlogFromFallback();
        }
      })
      .catch(function () {
        loadBlogFromFallback().catch(function () {
          if (blogGrid) blogGrid.innerHTML = '<p class="blog-loading">Unable to load blog posts.</p>';
        });
      });
  }

  /* ========== Projects ========== */
  function renderProjects(repos) {
    if (!projectsGrid) return;
    projectsGrid.innerHTML = '';

    repos.forEach(function (r) {
      var card = document.createElement('a');
      card.href = r.html_url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.className = 'project-card';
      card.innerHTML =
        '<div class="project-header">' +
          '<i class="fa-brands fa-github project-icon"></i>' +
          '<div class="project-stats">' +
            '<span><i class="fa-solid fa-star"></i> ' + r.stargazers_count + '</span>' +
            '<span><i class="fa-solid fa-code-fork"></i> ' + r.forks_count + '</span>' +
          '</div>' +
        '</div>' +
        '<h3 class="project-name">' + escapeHtml(r.name) + '</h3>' +
        '<p class="project-desc">' + escapeHtml(r.description || '') + '</p>' +
        '<span class="project-lang">' +
          '<span class="lang-dot" style="background:' + escapeHtml(r.language_color || '#8b949e') + '"></span>' +
          escapeHtml(r.language || '') +
        '</span>';
      projectsGrid.appendChild(card);
    });
  }

  function loadReposFromFallback() {
    return fetch(REPOS_FALLBACK, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { return r.json(); })
      .then(function (allRepos) {
        if (!Array.isArray(allRepos) || allRepos.length === 0) {
          projectsGrid.innerHTML = '<p class="blog-loading">Unable to load projects.</p>';
          return;
        }
        allRepos.sort(function (a, b) { return (b.stargazers_count || 0) - (a.stargazers_count || 0); });
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
        renderProjects(repos);
      });
  }

  if (isLocal) {
    loadReposFromFallback().catch(function () {
      if (projectsGrid) projectsGrid.innerHTML = '<p class="blog-loading">Unable to load projects.</p>';
    });
  } else {
    fetch('/api/repos')
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (data) {
        if (data.repos && data.repos.length) {
          renderProjects(data.repos);
        } else {
          return loadReposFromFallback();
        }
      })
      .catch(function () {
        loadReposFromFallback().catch(function () {
          if (projectsGrid) projectsGrid.innerHTML = '<p class="blog-loading">Unable to load projects.</p>';
        });
      });
  }

  /* ========== GitHub Stats Summary ========== */
  var statRepos     = document.getElementById('statRepos');
  var statFollowers = document.getElementById('statFollowers');
  var statStars     = document.getElementById('statStars');

  function countUp(el, target) {
    if (!el) return;
    var duration = 1600;
    var start = performance.now();
    function step(now) {
      var progress = Math.min((now - start) / duration, 1);
      var ease = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(ease * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function renderStats(stats) {
    countUp(statRepos, stats.public_repos || 0);
    countUp(statFollowers, stats.followers || 0);
    countUp(statStars, stats.total_stars || 0);
  }

  // A rate-limited/error GitHub response comes back as zeros — require real
  // values so the card never shows a misleading 0.
  function statsOk(s) {
    return !!s && s.public_repos > 0 && s.followers > 0 && s.total_stars > 0;
  }

  var STATS_CACHE_KEY = 'gh_stats_v1';
  function cacheStats(s) { try { localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(s)); } catch (e) {} }
  function getCachedStats() { try { return JSON.parse(localStorage.getItem(STATS_CACHE_KEY)); } catch (e) { return null; } }

  // Show last-known-good values instantly so the card is never blank or zero.
  var cachedStats = getCachedStats();
  if (statsOk(cachedStats)) renderStats(cachedStats);

  // Prefer fresh valid data (and cache it); otherwise keep the cached values;
  // only fall back to a dash when there is nothing good to show.
  function applyStats(stats) {
    if (statsOk(stats)) { cacheStats(stats); renderStats(stats); }
    else if (statsOk(cachedStats)) { renderStats(cachedStats); }
    else { showStatsError(); }
  }

  // Sum stargazers across all public repos, paginated (GitHub caps at 100/page).
  function sumStarsFromFallback(page, acc) {
    page = page || 1;
    acc = acc || 0;
    if (page > 5) return Promise.resolve(acc);
    return fetch(REPOS_FALLBACK + '&page=' + page, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { return r.json(); })
      .then(function (repos) {
        if (!Array.isArray(repos) || repos.length === 0) return acc;
        var sum = repos.reduce(function (s, r) { return s + (r.stargazers_count || 0); }, acc);
        if (repos.length < 100) return sum;
        return sumStarsFromFallback(page + 1, sum);
      });
  }

  function loadStatsFromFallback() {
    var userPromise = fetch(USER_FALLBACK, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { return r.json(); });

    return Promise.all([userPromise, sumStarsFromFallback()]).then(function (results) {
      var user = results[0] || {};
      applyStats({
        public_repos: user.public_repos || 0,
        followers: user.followers || 0,
        total_stars: results[1] || 0,
      });
    });
  }

  function showStatsError() {
    if (statsOk(cachedStats)) { renderStats(cachedStats); return; }
    if (statRepos) statRepos.textContent = '—';
    if (statFollowers) statFollowers.textContent = '—';
    if (statStars) statStars.textContent = '—';
  }

  if (isLocal) {
    loadStatsFromFallback().catch(showStatsError);
  } else {
    fetch('/api/stats')
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (stats) {
        if (statsOk(stats)) {
          applyStats(stats);
        } else {
          return loadStatsFromFallback();
        }
      })
      .catch(function () {
        loadStatsFromFallback().catch(showStatsError);
      });
  }

  /* ========== Israel Rankings (gayanvoice/top-github-users) ========== */
  var rankPublic         = document.getElementById('rankPublic');
  var rankPublicTotal    = document.getElementById('rankPublicTotal');
  var rankTotal          = document.getElementById('rankTotal');
  var rankTotalTotal     = document.getElementById('rankTotalTotal');
  var rankFollowers      = document.getElementById('rankFollowers');
  var rankFollowersTotal = document.getElementById('rankFollowersTotal');

  // Rank = last `<td>number</td>` before the user's profile link; total = rows.
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

  function setRank(elRank, elTotal, obj) {
    if (obj && obj.rank) {
      if (elRank) elRank.textContent = '#' + obj.rank.toLocaleString();
      if (elTotal) elTotal.textContent = 'of ' + obj.total.toLocaleString();
    } else {
      if (elRank) elRank.textContent = '—';
      if (elTotal) elTotal.textContent = '';
    }
  }

  function renderRankings(data) {
    data = data || {};
    setRank(rankPublic, rankPublicTotal, data.public_contributions);
    setRank(rankTotal, rankTotalTotal, data.total_contributions);
    setRank(rankFollowers, rankFollowersTotal, data.followers);
  }

  function loadRankingsFromFallback() {
    return Promise.all(RANK_LISTS.map(function (list) {
      return fetch(RANK_BASE + '/' + list + '/' + RANK_COUNTRY + '.md')
        .then(function (r) { return r.text(); })
        .then(function (md) { return parseRank(md, RANK_USER); })
        .catch(function () { return null; });
    })).then(function (res) {
      renderRankings({
        public_contributions: res[0],
        total_contributions: res[1],
        followers: res[2],
      });
    });
  }

  if (isLocal) {
    loadRankingsFromFallback().catch(function () { renderRankings(null); });
  } else {
    fetch('/api/rankings')
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (data) {
        if (data && (data.public_contributions || data.followers || data.total_contributions)) {
          renderRankings(data);
        } else {
          return loadRankingsFromFallback();
        }
      })
      .catch(function () {
        loadRankingsFromFallback().catch(function () { renderRankings(null); });
      });
  }

})();

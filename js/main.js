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

})();

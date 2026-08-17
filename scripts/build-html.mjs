#!/usr/bin/env node
// Build step: render templates/index.html with data.json → index.html.
// Render logic lives in ../lib/render.mjs (shared with the live function).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  esc, figures, projects, posts, activityStats, israelRankBadge,
  dockerStats, activityCells, activityCaption,
} from '../lib/render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const [tpl, data] = await Promise.all([
    readFile(join(ROOT, 'templates', 'index.html'), 'utf8'),
    readFile(join(ROOT, 'data.json'), 'utf8').then(JSON.parse),
  ]);

  const now = Date.now();
  const profile = data.profile || {};
  const weeks = Array.isArray(data.weeks) ? data.weeks : [];

  const html = tpl
    .replace('<!--FIGURES-->', figures(profile))
    .replace(/<!--REPO_COUNT-->/g, esc(profile.publicRepos || 0))
    .replace('<!--ISRAEL_RANK-->', israelRankBadge(data.israelRank))
    .replace('<!--ACTIVITY_STATS-->', activityStats(profile))
    .replace('<!--ACTIVITY_CELLS-->', activityCells(weeks))
    .replace('<!--ACTIVITY_CAPTION-->', activityCaption(profile, weeks))
    .replace('<!--DOCKER_STATS-->', dockerStats(data.docker))
    .replace('<!--PROJECTS-->', projects(data.featured || [], now))
    .replace('<!--POSTS-->', posts(data.posts || []))
    .replace(/<!--YEAR-->/g, String(new Date(now).getUTCFullYear()));

  await writeFile(join(ROOT, 'index.html'), html);
  console.log('index.html built.');
}

main().catch((e) => { console.error(e); process.exit(1); });

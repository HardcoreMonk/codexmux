#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLandingSite } from './landing-site-check-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = await checkLandingSite({
  siteDir: path.join(rootDir, '_site'),
  canonicalBase: 'https://hardcoremonk.github.io/codexmux',
  requiredPaths: [
    'index.html',
    'ko/index.html',
    'docs/index.html',
    'ko/docs/index.html',
    'docs/agent-quickstart/index.html',
    'ko/docs/agent-quickstart/index.html',
    'docs/linux-service/index.html',
    'ko/docs/linux-service/index.html',
    'docs/project-governance/index.html',
    'ko/docs/project-governance/index.html',
    '404.html',
    'robots.txt',
    'sitemap.xml',
    'search-index.json',
    'style.css',
    'style-docs.css',
  ],
});

console.log(JSON.stringify({ ok: true, ...result }, null, 2));

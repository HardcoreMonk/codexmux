import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/landing-site-check-lib.mjs')).href);

describe('landing site artifact check', () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-landing-check-'));
  });

  afterEach(async () => {
    await fs.rm(siteDir, { recursive: true, force: true });
  });

  const write = async (relativePath: string, content = '') => {
    const filePath = path.join(siteDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  };

  const writeValidSite = async () => {
    await write('index.html', `
      <link rel="canonical" href="https://hardcoremonk.github.io/codexmux/">
      <a href="/codexmux/docs/">Docs</a>
      <img src="/codexmux/images/og-image.png" alt="">
      <a href="https://github.com/HardcoreMonk/codexmux">GitHub</a>
    `);
    await write('docs/index.html', `
      <link rel="canonical" href="https://hardcoremonk.github.io/codexmux/docs/">
      <a href="/codexmux/">Home</a>
    `);
    await write('images/og-image.png');
    await write('404.html');
    await write('robots.txt');
    await write('sitemap.xml');
  };

  it('accepts required pages, canonical URLs, internal assets and external links', async () => {
    const { checkLandingSite } = await loadLib();
    await writeValidSite();

    await expect(checkLandingSite({
      siteDir,
      canonicalBase: 'https://hardcoremonk.github.io/codexmux',
      requiredPaths: ['index.html', 'docs/index.html', '404.html', 'robots.txt', 'sitemap.xml'],
    })).resolves.toMatchObject({
      htmlFiles: 3,
      localLinks: 3,
    });
  });

  it('fails when a required artifact is missing', async () => {
    const { checkLandingSite } = await loadLib();
    await writeValidSite();

    await expect(checkLandingSite({
      siteDir,
      canonicalBase: 'https://hardcoremonk.github.io/codexmux',
      requiredPaths: ['docs/agent-quickstart/index.html'],
    })).rejects.toThrow('missing required landing artifact');
  });

  it('fails when an HTML canonical points outside the Pages origin', async () => {
    const { checkLandingSite } = await loadLib();
    await write('index.html', '<link rel="canonical" href="https://subicura.com/codexmux/">');

    await expect(checkLandingSite({
      siteDir,
      canonicalBase: 'https://hardcoremonk.github.io/codexmux',
      requiredPaths: ['index.html'],
    })).rejects.toThrow('invalid landing canonical');
  });

  it('fails closed on a broken /codexmux link', async () => {
    const { checkLandingSite } = await loadLib();
    await write('index.html', `
      <link rel="canonical" href="https://hardcoremonk.github.io/codexmux/">
      <a href="/codexmux/docs/missing/">Missing</a>
    `);

    await expect(checkLandingSite({
      siteDir,
      canonicalBase: 'https://hardcoremonk.github.io/codexmux',
      requiredPaths: ['index.html'],
    })).rejects.toThrow('broken landing link');
  });

  it('fails closed when a /codexmux link escapes the artifact root', async () => {
    const { checkLandingSite } = await loadLib();
    await write('index.html', `
      <link rel="canonical" href="https://hardcoremonk.github.io/codexmux/">
      <a href="/codexmux/../private.txt">Escape</a>
    `);

    await expect(checkLandingSite({
      siteDir,
      canonicalBase: 'https://hardcoremonk.github.io/codexmux',
      requiredPaths: ['index.html'],
    })).rejects.toThrow('escapes landing root');
  });

  it('enforces required and forbidden content in generated pages', async () => {
    const { checkLandingSite } = await loadLib();
    await writeValidSite();

    await expect(checkLandingSite({
      siteDir,
      canonicalBase: 'https://hardcoremonk.github.io/codexmux',
      requiredPaths: ['index.html'],
      contentContracts: [{
        path: 'index.html',
        includes: ['Session Operations', 'Project Governance'],
        excludes: ['purplemux'],
      }],
    })).rejects.toThrow('missing required landing content');

    await write('index.html', `
      <link rel="canonical" href="https://hardcoremonk.github.io/codexmux/">
      <h1>Session Operations</h1>
      <p>Project Governance</p>
    `);

    await expect(checkLandingSite({
      siteDir,
      canonicalBase: 'https://hardcoremonk.github.io/codexmux',
      requiredPaths: ['index.html'],
      contentContracts: [{
        path: 'index.html',
        includes: ['Session Operations', 'Project Governance'],
        excludes: ['purplemux'],
      }],
    })).resolves.toMatchObject({ contentContracts: 1 });

    await write('index.html', `
      <link rel="canonical" href="https://hardcoremonk.github.io/codexmux/">
      <h1>Session Operations</h1>
      <p>Project Governance · purplemux</p>
    `);

    await expect(checkLandingSite({
      siteDir,
      canonicalBase: 'https://hardcoremonk.github.io/codexmux',
      requiredPaths: ['index.html'],
      contentContracts: [{
        path: 'index.html',
        includes: ['Session Operations', 'Project Governance'],
        excludes: ['purplemux'],
      }],
    })).rejects.toThrow('forbidden landing content');
  });
});

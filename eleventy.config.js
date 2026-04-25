module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ 'landing-src/images': 'images' });
  eleventyConfig.addPassthroughCopy({ 'landing-src/style.css': 'style.css' });
  eleventyConfig.addPassthroughCopy({ 'landing-src/style-docs.css': 'style-docs.css' });
  eleventyConfig.addPassthroughCopy({ 'landing-src/download.js': 'download.js' });
  eleventyConfig.addPassthroughCopy({ 'landing-src/docs.js': 'docs.js' });

  eleventyConfig.setServerOptions({
    port: 8181,
  });

  eleventyConfig.addFilter('docsNeighbors', (flat, slug) => {
    const idx = flat.findIndex((i) => i.slug === slug);
    if (idx < 0) return { prev: null, next: null };
    return {
      prev: idx > 0 ? flat[idx - 1] : null,
      next: idx < flat.length - 1 ? flat[idx + 1] : null,
    };
  });

  const LOCALE_CODES = [
    'en', 'ko', 'ja', 'zh-CN', 'zh-TW', 'de', 'es', 'fr', 'pt-BR', 'ru', 'tr',
  ];

  // Strip any supported locale prefix from a docs URL and return just the
  // tail (e.g. "quickstart/" or "" for index).
  const docsTail = (url) => {
    if (typeof url !== 'string') return '';
    for (const code of LOCALE_CODES) {
      if (code === 'en') continue;
      const prefix = `/${code}/docs/`;
      if (url.startsWith(prefix)) return url.slice(prefix.length);
    }
    if (url.startsWith('/docs/')) return url.slice('/docs/'.length);
    return '';
  };

  const docsUrlFor = (locale, tail) => {
    const prefix = locale === 'en' ? '/purplemux/docs/' : `/purplemux/${locale}/docs/`;
    return prefix + tail;
  };

  eleventyConfig.addFilter('localizeDocsUrl', (url, targetLocale) =>
    docsUrlFor(targetLocale, docsTail(url)),
  );

  eleventyConfig.addFilter('findDocsGroup', (nav, slug, locale) => {
    for (const group of nav) {
      for (const item of group.items) {
        if (item.slug === slug) return group.group[locale] || group.group.en || '';
      }
    }
    return '';
  });

  eleventyConfig.addCollection('docs', (api) =>
    api
      .getAll()
      .filter((item) => {
        if (!item.url) return false;
        const url = item.url;
        const isDocsRoot = url === '/docs/';
        const isLocaleIndex = LOCALE_CODES.some(
          (c) => c !== 'en' && url === `/${c}/docs/`,
        );
        const isDoc =
          url.startsWith('/docs/') ||
          LOCALE_CODES.some((c) => c !== 'en' && url.startsWith(`/${c}/docs/`));
        return isDoc && !isDocsRoot && !isLocaleIndex;
      })
      .sort((a, b) => (a.url > b.url ? 1 : -1)),
  );

  return {
    dir: {
      input: 'landing-src',
      output: '_site',
      includes: '_includes',
      data: '_data',
    },
    pathPrefix: '/purplemux/',
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
    templateFormats: ['njk', 'html', 'md'],
  };
};

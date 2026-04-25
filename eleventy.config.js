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

  eleventyConfig.addFilter('swapDocsLocale', (url) => {
    if (typeof url !== 'string') return '/purplemux/docs/';
    if (url.startsWith('/ko/docs/')) return '/purplemux/docs/' + url.slice(9);
    if (url.startsWith('/docs/')) return '/purplemux/ko/docs/' + url.slice(6);
    return '/purplemux' + url;
  });

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
        const isDoc = item.url.startsWith('/docs/') || item.url.startsWith('/ko/docs/');
        const isIndex = item.url === '/docs/' || item.url === '/ko/docs/';
        return isDoc && !isIndex;
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

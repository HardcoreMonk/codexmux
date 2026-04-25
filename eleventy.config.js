module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ 'landing-src/images': 'images' });
  eleventyConfig.addPassthroughCopy({ 'landing-src/style.css': 'style.css' });
  eleventyConfig.addPassthroughCopy({ 'landing-src/download.js': 'download.js' });

  eleventyConfig.setServerOptions({
    port: 8181,
  });

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

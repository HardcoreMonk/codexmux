// Each item here produces a real page. Add entries only when the underlying
// markdown/njk file exists in both /docs and /docs/ko so the sidebar never
// hands visitors a 404.
module.exports = [
  {
    group: { en: 'Getting Started', ko: '시작하기' },
    items: [
      { slug: 'quickstart', label: { en: 'Quickstart', ko: '빠른 시작' } },
      { slug: 'installation', label: { en: 'Installation', ko: '설치' } },
      { slug: 'browser-support', label: { en: 'Browser support', ko: '브라우저 지원' } },
      { slug: 'first-session', label: { en: 'First session', ko: '첫 세션' } },
    ],
  },
  {
    group: { en: 'Reference', ko: '레퍼런스' },
    items: [
      { slug: 'keyboard-shortcuts', label: { en: 'Keyboard shortcuts', ko: '키보드 단축키' } },
    ],
  },
];

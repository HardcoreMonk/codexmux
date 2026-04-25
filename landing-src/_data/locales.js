// Locales that have docs translations. Landing supports 11 locales; docs
// follows the same list. The "path" value is used as the URL prefix — en is
// root (no prefix), everything else lives under /<code>/docs/.
module.exports = [
  { code: 'en', label: 'English', htmlLang: 'en', path: '' },
  { code: 'ko', label: '한국어', htmlLang: 'ko', path: '/ko' },
  { code: 'ja', label: '日本語', htmlLang: 'ja', path: '/ja' },
  { code: 'zh-CN', label: '简体中文', htmlLang: 'zh-CN', path: '/zh-CN' },
  { code: 'zh-TW', label: '繁體中文', htmlLang: 'zh-TW', path: '/zh-TW' },
  { code: 'de', label: 'Deutsch', htmlLang: 'de', path: '/de' },
  { code: 'es', label: 'Español', htmlLang: 'es', path: '/es' },
  { code: 'fr', label: 'Français', htmlLang: 'fr', path: '/fr' },
  { code: 'pt-BR', label: 'Português', htmlLang: 'pt-BR', path: '/pt-BR' },
  { code: 'ru', label: 'Русский', htmlLang: 'ru', path: '/ru' },
  { code: 'tr', label: 'Türkçe', htmlLang: 'tr', path: '/tr' },
];

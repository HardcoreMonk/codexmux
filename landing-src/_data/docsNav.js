// Each item here produces a real page. Add entries only when the underlying
// markdown/njk file exists in both /docs and /docs/<locale> so the sidebar never
// hands visitors a 404.
module.exports = [
  {
    group: { en: 'Getting Started', ko: '시작하기', fr: 'Commencer', ja: 'はじめに', 'zh-CN': '入门', 'zh-TW': '開始上手', de: 'Erste Schritte', es: 'Primeros pasos', 'pt-BR': 'Primeiros passos', ru: 'Начало работы', tr: 'Başlarken' },
    items: [
      { slug: 'quickstart', label: { en: 'Quickstart', ko: '빠른 시작', fr: 'Démarrage rapide', ja: 'クイックスタート', 'zh-CN': '快速开始', 'zh-TW': '快速開始', de: 'Schnellstart', es: 'Inicio rápido', 'pt-BR': 'Início rápido', ru: 'Быстрый старт', tr: 'Hızlı başlangıç' } },
      { slug: 'installation', label: { en: 'Installation', ko: '설치', fr: 'Installation', ja: 'インストール', 'zh-CN': '安装', 'zh-TW': '安裝', de: 'Installation', es: 'Instalación', 'pt-BR': 'Instalação', ru: 'Установка', tr: 'Kurulum' } },
      { slug: 'browser-support', label: { en: 'Browser support', ko: '브라우저 지원', fr: 'Compatibilité navigateur', ja: 'ブラウザサポート', 'zh-CN': '浏览器支持', 'zh-TW': '瀏覽器支援', de: 'Browser-Unterstützung', es: 'Compatibilidad de navegadores', 'pt-BR': 'Suporte a navegadores', ru: 'Поддержка браузеров', tr: 'Tarayıcı desteği' } },
      { slug: 'first-session', label: { en: 'First session', ko: '첫 세션', fr: 'Première session', ja: '最初のセッション', 'zh-CN': '第一个会话', 'zh-TW': '第一個工作階段', de: 'Erste Session', es: 'Primera sesión', 'pt-BR': 'Primeira sessão', ru: 'Первая сессия', tr: 'İlk oturum' } },
    ],
  },
  {
    group: { en: 'Workspaces & Terminal', ko: '워크스페이스 & 터미널', fr: 'Espaces de travail & terminal', ja: 'ワークスペース & ターミナル', 'zh-CN': '工作区与终端', 'zh-TW': '工作區與終端機', de: 'Workspaces & Terminal', es: 'Espacios de trabajo y terminal', 'pt-BR': 'Workspaces e Terminal', ru: 'Рабочие пространства и терминал', tr: 'Çalışma alanları & Terminal' },
    items: [
      { slug: 'workspaces-groups', label: { en: 'Workspaces & groups', ko: '워크스페이스와 그룹', fr: 'Espaces de travail & groupes', ja: 'ワークスペースとグループ', 'zh-CN': '工作区与分组', 'zh-TW': '工作區與群組', de: 'Workspaces & Gruppen', es: 'Espacios de trabajo y grupos', 'pt-BR': 'Workspaces e grupos', ru: 'Рабочие пространства и группы', tr: 'Çalışma alanları & gruplar' } },
      { slug: 'tabs-panes', label: { en: 'Tabs & panes', ko: '탭 & 창', fr: 'Onglets & volets', ja: 'タブとペイン', 'zh-CN': '标签页与窗格', 'zh-TW': '分頁與窗格', de: 'Tabs & Panels', es: 'Pestañas y paneles', 'pt-BR': 'Abas e painéis', ru: 'Вкладки и панели', tr: 'Sekmeler & paneller' } },
      { slug: 'save-restore', label: { en: 'Save & restore layouts', ko: '레이아웃 저장 & 복원', fr: 'Sauvegarder & restaurer les mises en page', ja: 'レイアウトの保存と復元', 'zh-CN': '保存与恢复布局', 'zh-TW': '儲存與還原版面', de: 'Layouts speichern & wiederherstellen', es: 'Guardar y restaurar disposiciones', 'pt-BR': 'Salvar e restaurar layouts', ru: 'Сохранение и восстановление раскладок', tr: 'Düzenleri kaydet & geri yükle' } },
      { slug: 'git-workflow', label: { en: 'Git workflow panel', ko: 'Git 워크플로 패널', fr: 'Panneau de workflow Git', ja: 'Git ワークフローパネル', 'zh-CN': 'Git 工作流面板', 'zh-TW': 'Git 工作流面板', de: 'Git-Workflow-Panel', es: 'Panel de flujo de Git', 'pt-BR': 'Painel de Git workflow', ru: 'Панель Git workflow', tr: 'Git workflow paneli' } },
      { slug: 'web-browser-panel', label: { en: 'Web browser panel', ko: '웹 브라우저 패널', fr: 'Panneau navigateur web', ja: 'Web ブラウザパネル', 'zh-CN': 'Web 浏览器面板', 'zh-TW': '網頁瀏覽器面板', de: 'Web-Browser-Panel', es: 'Panel de navegador web', 'pt-BR': 'Painel de navegador web', ru: 'Панель веб-браузера', tr: 'Web tarayıcı paneli' } },
    ],
  },
  {
    group: { en: 'Claude Code', ko: 'Claude Code', fr: 'Claude Code', ja: 'Claude Code', 'zh-CN': 'Claude Code', 'zh-TW': 'Claude Code', de: 'Claude Code', es: 'Claude Code', 'pt-BR': 'Claude Code', ru: 'Claude Code', tr: 'Claude Code' },
    items: [
      { slug: 'session-status', label: { en: 'Session status', ko: '세션 상태', fr: 'Statut de session', ja: 'セッションステータス', 'zh-CN': '会话状态', 'zh-TW': '工作階段狀態', de: 'Session-Status', es: 'Estado de la sesión', 'pt-BR': 'Status da sessão', ru: 'Статус сессии', tr: 'Oturum durumu' } },
      { slug: 'live-session-view', label: { en: 'Live session view', ko: '라이브 세션 뷰', fr: 'Vue de session en direct', ja: 'ライブセッションビュー', 'zh-CN': '实时会话视图', 'zh-TW': '即時工作階段檢視', de: 'Live-Session-Ansicht', es: 'Vista de sesión en directo', 'pt-BR': 'Visualização de sessão ao vivo', ru: 'Живой вид сессии', tr: 'Canlı oturum görünümü' } },
      { slug: 'permission-prompts', label: { en: 'Permission prompts', ko: '권한 프롬프트', fr: 'Invites de permission', ja: '権限プロンプト', 'zh-CN': '权限提示', 'zh-TW': '權限提示', de: 'Berechtigungs-Prompts', es: 'Avisos de permisos', 'pt-BR': 'Prompts de permissão', ru: 'Запросы разрешений', tr: 'İzin istemleri' } },
      { slug: 'quick-prompts-attachments', label: { en: 'Quick prompts & attachments', ko: '퀵 프롬프트 & 첨부', fr: 'Prompts rapides & pièces jointes', ja: 'クイックプロンプト & 添付', 'zh-CN': '快捷提示与附件', 'zh-TW': '快速 prompts 與附件', de: 'Quick-Prompts & Anhänge', es: 'Prompts rápidos y adjuntos', 'pt-BR': 'Quick prompts e anexos', ru: 'Быстрые промпты и вложения', tr: 'Hızlı promptlar & ekler' } },
      { slug: 'usage-rate-limits', label: { en: 'Usage & rate limits', ko: '사용량 & 요금 제한', fr: 'Usage & limites de débit', ja: '使用量とレート制限', 'zh-CN': '用量与速率限制', 'zh-TW': '用量與用量限制', de: 'Nutzung & Rate-Limits', es: 'Uso y límites de tasa', 'pt-BR': 'Uso e rate limits', ru: 'Использование и лимиты', tr: 'Kullanım & kota sınırları' } },
      { slug: 'notes-daily-report', label: { en: 'Notes (AI daily report)', ko: '노트 (AI 데일리 리포트)', fr: 'Notes (rapport quotidien IA)', ja: 'ノート (AI 日次レポート)', 'zh-CN': '笔记(AI 每日报告)', 'zh-TW': '筆記（AI 每日報告）', de: 'Notizen (AI-Tagesbericht)', es: 'Notas (informe diario de IA)', 'pt-BR': 'Notas (relatório diário com IA)', ru: 'Заметки (AI-дайджест дня)', tr: 'Notlar (AI günlük raporu)' } },
    ],
  },
  {
    group: { en: 'Mobile & Remote', ko: '모바일 & 원격', fr: 'Mobile & distant', ja: 'モバイル & リモート', 'zh-CN': '移动与远程', 'zh-TW': '行動與遠端', de: 'Mobile & Remote', es: 'Móvil y remoto', 'pt-BR': 'Mobile e Remoto', ru: 'Мобильные и удалённый доступ', tr: 'Mobil & Uzaktan' },
    items: [
      { slug: 'pwa-setup', label: { en: 'PWA setup', ko: 'PWA 설정', fr: 'Configuration PWA', ja: 'PWA セットアップ', 'zh-CN': 'PWA 设置', 'zh-TW': 'PWA 設定', de: 'PWA-Setup', es: 'Configuración de PWA', 'pt-BR': 'Configuração de PWA', ru: 'Настройка PWA', tr: 'PWA kurulumu' } },
      { slug: 'web-push', label: { en: 'Web Push notifications', ko: '웹 푸시 알림', fr: 'Notifications Web Push', ja: 'Web Push 通知', 'zh-CN': 'Web Push 通知', 'zh-TW': 'Web Push 通知', de: 'Web-Push-Notifications', es: 'Notificaciones Web Push', 'pt-BR': 'Notificações Web Push', ru: 'Web Push уведомления', tr: 'Web Push bildirimleri' } },
      { slug: 'tailscale', label: { en: 'Tailscale access', ko: 'Tailscale 접속', fr: 'Accès Tailscale', ja: 'Tailscale アクセス', 'zh-CN': 'Tailscale 访问', 'zh-TW': 'Tailscale 存取', de: 'Tailscale-Zugriff', es: 'Acceso por Tailscale', 'pt-BR': 'Acesso via Tailscale', ru: 'Доступ через Tailscale', tr: 'Tailscale erişimi' } },
      { slug: 'security-auth', label: { en: 'Security & auth', ko: '보안 & 인증', fr: 'Sécurité & auth', ja: 'セキュリティと認証', 'zh-CN': '安全与认证', 'zh-TW': '安全與認證', de: 'Sicherheit & Auth', es: 'Seguridad y autenticación', 'pt-BR': 'Segurança e autenticação', ru: 'Безопасность и аутентификация', tr: 'Güvenlik & kimlik doğrulama' } },
    ],
  },
  {
    group: { en: 'Customization', ko: '커스터마이즈', fr: 'Personnalisation', ja: 'カスタマイズ', 'zh-CN': '自定义', 'zh-TW': '自訂', de: 'Anpassung', es: 'Personalización', 'pt-BR': 'Personalização', ru: 'Кастомизация', tr: 'Özelleştirme' },
    items: [
      { slug: 'themes-fonts', label: { en: 'Themes & fonts', ko: '테마 & 폰트', fr: 'Thèmes & polices', ja: 'テーマとフォント', 'zh-CN': '主题与字体', 'zh-TW': '主題與字型', de: 'Themes & Schriften', es: 'Temas y fuentes', 'pt-BR': 'Temas e fontes', ru: 'Темы и шрифты', tr: 'Temalar & fontlar' } },
      { slug: 'custom-css', label: { en: 'Custom CSS', ko: '커스텀 CSS', fr: 'CSS personnalisé', ja: 'カスタム CSS', 'zh-CN': '自定义 CSS', 'zh-TW': '自訂 CSS', de: 'Custom CSS', es: 'CSS personalizado', 'pt-BR': 'CSS personalizado', ru: 'Custom CSS', tr: 'Özel CSS' } },
      { slug: 'terminal-themes', label: { en: 'Terminal themes', ko: '터미널 테마', fr: 'Thèmes terminal', ja: 'ターミナルテーマ', 'zh-CN': '终端主题', 'zh-TW': '終端機主題', de: 'Terminal-Themes', es: 'Temas de terminal', 'pt-BR': 'Temas do terminal', ru: 'Темы терминала', tr: 'Terminal temaları' } },
      { slug: 'editor-integration', label: { en: 'Editor integration', ko: '에디터 연동', fr: 'Intégration éditeur', ja: 'エディタ連携', 'zh-CN': '编辑器集成', 'zh-TW': '編輯器整合', de: 'Editor-Integration', es: 'Integración con el editor', 'pt-BR': 'Integração com editor', ru: 'Интеграция с редактором', tr: 'Editör entegrasyonu' } },
      { slug: 'sidebar-options', label: { en: 'Sidebar & Claude options', ko: '사이드바 & Claude 옵션', fr: 'Barre latérale & options Claude', ja: 'サイドバーと Claude オプション', 'zh-CN': '侧边栏与 Claude 选项', 'zh-TW': '側邊欄與 Claude 選項', de: 'Seitenleiste & Claude-Optionen', es: 'Barra lateral y opciones de Claude', 'pt-BR': 'Barra lateral e opções do Claude', ru: 'Боковая панель и опции Claude', tr: 'Kenar çubuğu & Claude seçenekleri' } },
    ],
  },
  {
    group: { en: 'Reference', ko: '레퍼런스', fr: 'Référence', ja: 'リファレンス', 'zh-CN': '参考', 'zh-TW': '參考資料', de: 'Referenz', es: 'Referencia', 'pt-BR': 'Referência', ru: 'Справочник', tr: 'Referans' },
    items: [
      { slug: 'keyboard-shortcuts', label: { en: 'Keyboard shortcuts', ko: '키보드 단축키', fr: 'Raccourcis clavier', ja: 'キーボードショートカット', 'zh-CN': '键盘快捷键', 'zh-TW': '鍵盤快速鍵', de: 'Tastenkürzel', es: 'Atajos de teclado', 'pt-BR': 'Atalhos de teclado', ru: 'Клавиатурные сокращения', tr: 'Klavye kısayolları' } },
      { slug: 'data-directory', label: { en: 'Data directory', ko: '데이터 디렉토리', fr: 'Répertoire de données', ja: 'データディレクトリ', 'zh-CN': '数据目录', 'zh-TW': '資料目錄', de: 'Daten-Verzeichnis', es: 'Directorio de datos', 'pt-BR': 'Diretório de dados', ru: 'Каталог данных', tr: 'Veri dizini' } },
      { slug: 'ports-env-vars', label: { en: 'Ports & env vars', ko: '포트 & 환경변수', fr: "Ports & variables d'environnement", ja: 'ポートと環境変数', 'zh-CN': '端口与环境变量', 'zh-TW': '連接埠與環境變數', de: 'Ports & Umgebungsvariablen', es: 'Puertos y variables de entorno', 'pt-BR': 'Portas e variáveis de ambiente', ru: 'Порты и переменные окружения', tr: 'Portlar & ortam değişkenleri' } },
      { slug: 'architecture', label: { en: 'Architecture', ko: '아키텍처', fr: 'Architecture', ja: 'アーキテクチャ', 'zh-CN': '架构', 'zh-TW': '架構', de: 'Architektur', es: 'Arquitectura', 'pt-BR': 'Arquitetura', ru: 'Архитектура', tr: 'Mimari' } },
      { slug: 'cli-reference', label: { en: 'CLI reference', ko: 'CLI 레퍼런스', fr: 'Référence CLI', ja: 'CLI リファレンス', 'zh-CN': 'CLI 参考', 'zh-TW': 'CLI 參考', de: 'CLI-Referenz', es: 'Referencia del CLI', 'pt-BR': 'Referência da CLI', ru: 'CLI reference', tr: 'CLI referansı' } },
      { slug: 'troubleshooting', label: { en: 'Troubleshooting & FAQ', ko: '문제 해결 & FAQ', fr: 'Dépannage & FAQ', ja: 'トラブルシューティング & FAQ', 'zh-CN': '故障排查与 FAQ', 'zh-TW': '疑難排解與 FAQ', de: 'Troubleshooting & FAQ', es: 'Solución de problemas y FAQ', 'pt-BR': 'Solução de problemas e FAQ', ru: 'Поиск проблем и FAQ', tr: 'Sorun giderme & SSS' } },
    ],
  },
];

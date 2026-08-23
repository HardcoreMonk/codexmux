type TAppArea = 'workspace' | 'sessions' | 'governance';

type TAppAreaIcon = 'SquareTerminal' | 'Search' | 'ShieldCheck';

interface IAppAreaItem {
  id: TAppArea;
  href: '/' | '/sessions' | '/governance';
  labelKey: TAppArea;
  icon: TAppAreaIcon;
}

const APP_AREA_ITEMS: readonly IAppAreaItem[] = [
  { id: 'workspace', href: '/', labelKey: 'workspace', icon: 'SquareTerminal' },
  { id: 'sessions', href: '/sessions', labelKey: 'sessions', icon: 'Search' },
  { id: 'governance', href: '/governance', labelKey: 'governance', icon: 'ShieldCheck' },
];

const CORE_APP_AREA_SIDEBAR_IDS = new Set([
  'builtin-session-explorer',
  'builtin-governance',
]);

const matchesRoute = (pathname: string, route: string): boolean =>
  pathname === route || pathname.startsWith(`${route}/`);

const resolveAppArea = (pathname: string): TAppArea | null => {
  if (pathname === '/') return 'workspace';
  if (matchesRoute(pathname, '/sessions')) return 'sessions';
  if (matchesRoute(pathname, '/governance')) return 'governance';
  return null;
};

const isCoreAppAreaSidebarItem = (id: string): boolean =>
  CORE_APP_AREA_SIDEBAR_IDS.has(id);

export {
  APP_AREA_ITEMS,
  isCoreAppAreaSidebarItem,
  resolveAppArea,
};
export type { IAppAreaItem, TAppArea, TAppAreaIcon };

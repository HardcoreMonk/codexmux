import Link from 'next/link';
import { Search, ShieldCheck, SquareTerminal, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { APP_AREA_ITEMS, type TAppArea, type TAppAreaIcon } from '@/lib/app-navigation';

type TAppAreaNavigationVariant = 'desktop' | 'rail' | 'mobile-bottom' | 'mobile-sheet';

interface IAppAreaNavigationProps {
  currentArea: TAppArea | null;
  variant?: TAppAreaNavigationVariant;
  lastWorkspaceName?: string;
  onNavigate?: (area: TAppArea) => void;
  className?: string;
}

const ICONS: Record<TAppAreaIcon, LucideIcon> = {
  SquareTerminal,
  Search,
  ShieldCheck,
};

const AppAreaNavigation = ({
  currentArea,
  variant = 'desktop',
  lastWorkspaceName,
  onNavigate,
  className,
}: IAppAreaNavigationProps) => {
  const t = useTranslations('navigation');
  const isRail = variant === 'rail';
  const isMobileBottom = variant === 'mobile-bottom';

  return (
    <nav
      aria-label={t('label')}
      data-variant={variant}
      className={cn(
        variant === 'desktop' && 'space-y-0.5 border-b border-sidebar-border p-2',
        isRail && 'flex flex-col items-center gap-1 border-b border-sidebar-border px-1 py-2',
        isMobileBottom && 'grid grid-cols-3 border-t border-sidebar-border bg-background/95 backdrop-blur',
        variant === 'mobile-sheet' && 'space-y-1 border-b p-2',
        className,
      )}
    >
      {APP_AREA_ITEMS.map((item) => {
        const Icon = ICONS[item.icon];
        const current = item.id === currentArea;
        const label = t(item.labelKey);
        const showWorkspaceContext = variant === 'desktop'
          && item.id === 'workspace'
          && currentArea !== 'workspace'
          && !!lastWorkspaceName;

        return (
          <Link
            key={item.id}
            href={item.href}
            aria-label={isRail ? label : undefined}
            aria-current={current ? 'page' : undefined}
            data-current={current ? 'true' : undefined}
            title={isRail ? label : undefined}
            onClick={() => onNavigate?.(item.id)}
            className={cn(
              'relative text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              variant === 'desktop' && 'flex min-h-9 items-center gap-2 rounded-md px-2.5 py-1.5 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              isRail && 'flex h-10 w-10 items-center justify-center rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              isMobileBottom && 'flex min-h-12 touch-manipulation flex-col items-center justify-center gap-0.5 px-2 py-1 text-[10px] active:bg-accent/70',
              variant === 'mobile-sheet' && 'flex min-h-11 touch-manipulation items-center gap-3 rounded-md px-3 text-sm active:bg-accent/70',
              current && 'bg-accent/70 font-semibold text-foreground',
            )}
          >
            {current && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute bg-focus-indicator',
                  isMobileBottom ? 'inset-x-3 top-0 h-0.5 rounded-b' : 'inset-y-1 left-0 w-0.5 rounded-r',
                )}
              />
            )}
            <Icon className={cn('shrink-0', isMobileBottom ? 'h-4 w-4' : 'h-[18px] w-[18px]')} />
            {!isRail && (
              <span className={cn('min-w-0', variant === 'desktop' && 'flex-1')}>
                <span className="block truncate">{label}</span>
                {showWorkspaceContext && (
                  <span className="block truncate text-[10px] font-normal text-muted-foreground">
                    {t('lastWorkspace', { name: lastWorkspaceName })}
                  </span>
                )}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
};

export default AppAreaNavigation;
export type { IAppAreaNavigationProps, TAppAreaNavigationVariant };

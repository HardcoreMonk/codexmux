import { useTranslations } from 'next-intl';
import { useRouter } from 'next/router';
import { Bot, LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import useTabStore, { selectGlobalStatus } from '@/hooks/use-tab-store';
import AppLogo from '@/components/layout/app-logo';
import { useNotificationCount } from '@/components/features/terminal/notification-sheet';
import useAgentStore, { selectBlockedCount, selectHasWorkingAgent, selectUnreadCount } from '@/hooks/use-agent-store';
import useConfigStore from '@/hooks/use-config-store';

interface IAppHeaderProps {
  onMenuOpen?: () => void;
  workspaceName?: string;
}

const handleLogout = async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
};

const AppHeader = ({ onMenuOpen, workspaceName }: IAppHeaderProps) => {
  const t = useTranslations('header');
  const tc = useTranslations('common');
  const router = useRouter();
  const hasBusy = useTabStore((s) => selectGlobalStatus(s.tabs).busyCount > 0);
  const { attentionCount } = useNotificationCount();
  const blockedCount = useAgentStore(selectBlockedCount);
  const unreadCount = useAgentStore(selectUnreadCount);
  const hasWorkingAgent = useAgentStore(selectHasWorkingAgent);
  const agentEnabled = useConfigStore((s) => s.agentEnabled);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-sidebar-border bg-background px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        {onMenuOpen && (
          <button
            className="relative flex h-8 w-8 shrink-0 items-center justify-center text-foreground"
            onClick={onMenuOpen}
            aria-label={t('openMenu')}
          >
            <Menu className="h-5 w-5" />
            {attentionCount > 0 && (
              <span className="absolute -right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded bg-foreground/10 px-0.5 text-[9px] font-medium leading-none text-foreground/60">
                {attentionCount}
              </span>
            )}
          </button>
        )}
        <AppLogo shimmer={hasBusy} />
        {workspaceName && !router.pathname.startsWith('/agents') && (
          <>
            <span className="text-muted-foreground/40 text-sm">/</span>
            <span className="truncate text-sm font-medium text-muted-foreground">{workspaceName}</span>
          </>
        )}
      </div>

      <TooltipProvider>
        <div className="flex items-center gap-1">
          {agentEnabled && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-7 w-7"
                    onClick={() => router.push('/agents')}
                  />
                }
              >
                <Bot className={`h-4 w-4 ${hasWorkingAgent ? 'text-ui-teal animate-pulse' : 'text-muted-foreground'}`} />
                {(unreadCount > 0 || blockedCount > 0) && (
                  <span className="absolute -right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded bg-foreground/10 px-0.5 text-[9px] font-medium leading-none text-foreground/60">
                    {unreadCount > 0 ? unreadCount : blockedCount}
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent>{tc('agent')}</TooltipContent>
            </Tooltip>
          )}

          <AlertDialog>
            <Tooltip>
              <TooltipTrigger
                render={
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                      />
                    }
                  />
                }
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>{tc('logout')}</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{tc('logout')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {tc('logoutConfirm')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>{tc('logout')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TooltipProvider>
    </header>
  );
};

export default AppHeader;

import { useState } from 'react';
import { useRouter } from 'next/router';
import { Bell, Bot, LogOut, Menu } from 'lucide-react';
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
import NotificationSheet, { useNotificationCount } from '@/components/features/terminal/notification-sheet';
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
  const router = useRouter();
  const hasBusy = useTabStore((s) => selectGlobalStatus(s.tabs).busyCount > 0);
  const { busyCount, attentionCount } = useNotificationCount();
  const hasActive = busyCount > 0 || attentionCount > 0;
  const blockedCount = useAgentStore(selectBlockedCount);
  const unreadCount = useAgentStore(selectUnreadCount);
  const hasWorkingAgent = useAgentStore(selectHasWorkingAgent);
  const agentEnabled = useConfigStore((s) => s.agentEnabled);
  const [notificationOpen, setNotificationOpen] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-sidebar-border bg-background px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        {onMenuOpen && (
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center text-foreground"
            onClick={onMenuOpen}
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <AppLogo shimmer={hasBusy} />
        {workspaceName && (
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
                  <span className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[10px] font-medium leading-none text-white ${unreadCount > 0 ? 'bg-ui-teal' : 'bg-ui-amber'}`}>
                    {unreadCount > 0 ? unreadCount : blockedCount}
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent>에이전트</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-7 w-7"
                  onClick={() => setNotificationOpen(true)}
                />
              }
            >
              <Bell className={`h-4 w-4 text-muted-foreground${hasActive ? ' fill-current' : ''}`} />
              {attentionCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-ui-purple px-0.5 text-[9px] font-medium leading-none text-white">
                  {attentionCount}
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent>알림</TooltipContent>
          </Tooltip>

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
              <TooltipContent>로그아웃</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>로그아웃</AlertDialogTitle>
                <AlertDialogDescription>
                  로그아웃하시겠습니까? 다시 접속하려면 서버 로그의 비밀번호가 필요합니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>로그아웃</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TooltipProvider>
      <NotificationSheet
        open={notificationOpen}
        onOpenChange={setNotificationOpen}
      />
    </header>
  );
};

export default AppHeader;

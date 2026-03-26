import { Terminal, Bell, LogOut, Menu } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
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

interface IAppHeaderProps {
  onMenuOpen?: () => void;
}

const handleLogout = () => {
  signOut({ callbackUrl: `${window.location.origin}/login` });
};

const AppHeader = ({ onMenuOpen }: IAppHeaderProps) => {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-sidebar-border bg-background px-3">
      <div className="flex items-center gap-1.5">
        {onMenuOpen && (
          <button
            className="flex h-8 w-8 items-center justify-center text-foreground"
            onClick={onMenuOpen}
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <Terminal className="h-4 w-4 text-ui-purple" />
        <span className="text-sm font-semibold text-ui-purple">purplemux</span>
      </div>

      <TooltipProvider>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => toast.info('개발중입니다')}
                />
              }
            >
              <Bell className="h-4 w-4 text-muted-foreground" />
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
    </header>
  );
};

export default AppHeader;

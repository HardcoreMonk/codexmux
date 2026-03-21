import { Terminal, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const AppHeader = () => {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-sidebar-border bg-card px-3">
      <div className="flex items-center gap-1.5">
        <Terminal className="h-4 w-4 text-ui-purple" />
        <span className="text-sm font-semibold text-ui-purple">Purple Terminal</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => toast.info('개발중입니다')}
      >
        <Bell className="h-4 w-4 text-muted-foreground" />
      </Button>
    </header>
  );
};

export default AppHeader;

import { X, Plus, BotMessageSquare, Terminal } from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TPanelType } from '@/types/terminal';

interface IMobileTabHeaderProps {
  tabName: string;
  panelType: TPanelType;
  onToggleClaude: () => void;
  onCreateTab: () => void;
  onClose: () => void;
}

const MobileTabHeader = ({
  tabName,
  panelType,
  onToggleClaude,
  onCreateTab,
  onClose,
}: IMobileTabHeaderProps) => {
  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border/50 bg-background">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        {panelType === 'claude-code' ? (
          <BotMessageSquare size={14} className="shrink-0 text-muted-foreground" />
        ) : (
          <Terminal size={14} className="shrink-0 text-muted-foreground" />
        )}
        <span className="truncate text-xs text-foreground">{tabName}</span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 pr-0.5">
        <Tabs value={panelType} onValueChange={() => onToggleClaude()} className="gap-0">
          <TabsList className="h-7">
            <TabsTrigger value="terminal" className="h-full px-2 text-[10px] tracking-wide">
              TERMINAL
            </TabsTrigger>
            <TabsTrigger value="claude-code" className="h-full px-2 text-[10px] tracking-wide">
              CLAUDE
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <button
          className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors"
          onClick={onCreateTab}
          aria-label="새 탭"
        >
          <Plus size={16} />
        </button>

        <AlertDialog>
          <AlertDialogTrigger
            className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors"
            aria-label="탭 닫기"
          >
            <X size={16} />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>탭 닫기</AlertDialogTitle>
              <AlertDialogDescription>
                &apos;{tabName}&apos; 탭을 닫으시겠습니까?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                className="bg-ui-red hover:bg-ui-red/80"
                onClick={onClose}
              >
                닫기
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default MobileTabHeader;

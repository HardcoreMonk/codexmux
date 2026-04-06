import { useState } from 'react';
import { Terminal, Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/spinner';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TPanelType } from '@/types/terminal';

interface IMobileNewTabDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTab: (panelType?: TPanelType, options?: { command?: string }) => Promise<void>;
}

const MobileNewTabDialog = ({ open, onOpenChange, onCreateTab }: IMobileNewTabDialogProps) => {
  const tt = useTranslations('terminal');
  const tm = useTranslations('mobile');
  const [creatingKey, setCreatingKey] = useState<string | null>(null);

  const MENU_ITEMS = [
    { key: 'claude-new', type: 'claude-code' as const, icon: <ClaudeCodeIcon className="h-5 w-5" />, label: tt('claudeNewConversation'), startClaude: true },
    { key: 'claude', type: 'claude-code' as const, icon: <ClaudeCodeIcon className="h-5 w-5" />, label: tt('claudeSessionList') },
    { key: 'terminal', type: 'terminal' as const, icon: <Terminal className="h-5 w-5 text-muted-foreground" />, label: 'Terminal' },
    { key: 'web-browser', type: 'web-browser' as const, icon: <Globe className="h-5 w-5 text-muted-foreground" />, label: 'Web Browser' },
  ] as const;

  const handleSelect = async (item: (typeof MENU_ITEMS)[number]) => {
    setCreatingKey(item.key);
    if ('startClaude' in item && item.startClaude) {
      await onCreateTab(item.type, { command: 'claude-new' });
    } else {
      await onCreateTab(item.type);
    }
    setCreatingKey(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-xs gap-2 rounded-xl p-4">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">{tm('newTab')}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background text-foreground transition-colors active:bg-accent disabled:pointer-events-none disabled:opacity-50"
              disabled={creatingKey !== null}
              onClick={() => handleSelect(item)}
            >
              {creatingKey === item.key ? <Spinner className="h-4 w-4" /> : item.icon}
              <span className="text-xs">{item.label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MobileNewTabDialog;

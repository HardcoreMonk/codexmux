import { useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Settings, Sun, Terminal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import useTerminalTheme from '@/hooks/use-terminal-theme';
import type { ITerminalThemeColors } from '@/lib/terminal-themes';

type TSettingsTab = 'general' | 'terminal';

interface ISettingsItem {
  id: TSettingsTab;
  label: string;
  icon: React.ReactNode;
}

const settingsItems: ISettingsItem[] = [
  {
    id: 'general',
    label: '일반',
    icon: <Settings className="h-4 w-4" />,
  },
  {
    id: 'terminal',
    label: '터미널',
    icon: <Terminal className="h-4 w-4" />,
  },
];

const GeneralTab = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">테마</p>
          <p className="text-sm text-muted-foreground">화면 테마를 선택합니다.</p>
        </div>
        <ButtonGroup>
          <Button variant={theme === 'light' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('light')}>
            <Sun className="h-4 w-4" />
            라이트
          </Button>
          <Button variant={theme === 'dark' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('dark')}>
            <Moon className="h-4 w-4" />
            다크
          </Button>
          <Button variant={theme === 'system' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('system')}>
            <Monitor className="h-4 w-4" />
            시스템
          </Button>
        </ButtonGroup>
      </div>
    </div>
  );
};

const previewColors = (colors: ITerminalThemeColors) => [
  colors.red, colors.green, colors.yellow, colors.blue,
  colors.magenta, colors.cyan, colors.white,
];

const TerminalTab = () => {
  const { themeId, setTerminalTheme, themes } = useTerminalTheme();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">터미널 테마</p>
        <p className="text-sm text-muted-foreground">터미널 색상 테마를 선택합니다.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTerminalTheme(t.id)}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
              themeId === t.id
                ? 'border-primary bg-accent'
                : 'border-border hover:border-muted-foreground/50',
            )}
          >
            <span className="text-xs font-medium">{t.name}</span>
            <div
              className="flex h-5 items-center gap-1 rounded px-2"
              style={{ backgroundColor: t.colors.background }}
            >
              {previewColors(t.colors).map((color, i) => (
                <div
                  key={i}
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

interface ISettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SettingsDialog = ({ open, onOpenChange }: ISettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState<TSettingsTab>('general');

  const activeItem = settingsItems.find((item) => item.id === activeTab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 md:min-w-3xl md:max-w-3xl"
        showCloseButton={false}
      >
        <div className="flex h-[420px] flex-col md:flex-row">
          <div className="flex shrink-0 flex-col border-b bg-muted/30 p-3 md:w-48 md:border-b-0 md:border-r">
            <div className="mb-4 flex items-center justify-between px-2">
              <DialogTitle className="text-base font-semibold">설정</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-6 w-6 opacity-70 hover:opacity-100"
              >
                <X className="h-[18px] w-[18px]" />
                <span className="sr-only">닫기</span>
              </Button>
            </div>
            <nav className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:pb-0">
              {settingsItems.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    'shrink-0 justify-start gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium md:gap-3',
                    activeTab === item.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
                  )}
                >
                  {item.icon}
                  {item.label}
                </Button>
              ))}
            </nav>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <h2 className="mb-6 text-lg font-semibold">{activeItem?.label}</h2>
            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'terminal' && <TerminalTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;

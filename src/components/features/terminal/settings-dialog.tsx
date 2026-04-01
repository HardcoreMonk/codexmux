import { useState } from 'react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { Bot, Code, Dices, Globe, Lock, Monitor, Moon, RotateCcw, Settings, Sun, Terminal, Wrench, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
import { cn } from '@/lib/utils';
import useTerminalTheme from '@/hooks/use-terminal-theme';
import useConfigStore from '@/hooks/use-config-store';
import { TERMINAL_THEMES } from '@/lib/terminal-themes';
import type { ITerminalThemeColors } from '@/lib/terminal-themes';
import QuickPromptsSettings from '@/components/features/settings/quick-prompts-settings';
import TailscaleSettings from '@/components/features/settings/tailscale-settings';

type TSettingsTab = 'general' | 'terminal' | 'editor' | 'claude' | 'auth' | 'tailscale' | 'quick-prompts' | 'system';

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
  {
    id: 'editor',
    label: '에디터',
    icon: <Code className="h-4 w-4" />,
  },
  {
    id: 'claude',
    label: 'Claude',
    icon: <Bot className="h-4 w-4" />,
  },
  {
    id: 'auth',
    label: '인증',
    icon: <Lock className="h-4 w-4" />,
  },
  {
    id: 'tailscale',
    label: 'Tailscale',
    icon: <Globe className="h-4 w-4" />,
  },
  {
    id: 'quick-prompts',
    label: '빠른 프롬프트',
    icon: <Zap className="h-4 w-4" />,
  },
  {
    id: 'system',
    label: '시스템',
    icon: <Wrench className="h-4 w-4" />,
  },
];

const saveAppTheme = (value: string) => {
  fetch('/api/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appTheme: value }),
  }).catch(() => {});
};

const GeneralTab = () => {
  const { theme, setTheme } = useTheme();

  const handleThemeChange = (value: string) => {
    setTheme(value);
    saveAppTheme(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium">테마</p>
          <p className="text-sm text-muted-foreground">화면 테마를 선택합니다.</p>
        </div>
        <ButtonGroup>
          <Button variant={theme === 'light' ? 'default' : 'outline'} size="sm" onClick={() => handleThemeChange('light')}>
            <Sun className="h-4 w-4" />
            라이트
          </Button>
          <Button variant={theme === 'dark' ? 'default' : 'outline'} size="sm" onClick={() => handleThemeChange('dark')}>
            <Moon className="h-4 w-4" />
            다크
          </Button>
          <Button variant={theme === 'system' ? 'default' : 'outline'} size="sm" onClick={() => handleThemeChange('system')}>
            <Monitor className="h-4 w-4" />
            시스템
          </Button>
        </ButtonGroup>
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium">설치 및 실행</p>
          <p className="text-sm text-muted-foreground">앱 설치, 빌드, 실행 방법입니다.</p>
        </div>
        <div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
          <p className="text-muted-foreground/60"># 설치 및 빌드</p>
          <p>pnpm install</p>
          <p>pnpm build</p>
          <p className="mt-2 text-muted-foreground/60"># 실행</p>
          <p>pnpm start</p>
          <p className="mt-2 text-muted-foreground/60"># Tailscale로 외부 접속 (선택)</p>
          <p>tailscale serve --bg --https=443 http://localhost:8022</p>
        </div>
      </div>
    </div>
  );
};

const previewColors = (colors: ITerminalThemeColors) => [
  colors.red, colors.green, colors.yellow, colors.blue,
  colors.magenta, colors.cyan, colors.white,
];

const ThemeGrid = ({
  list,
  selectedId,
  onSelect,
}: {
  list: typeof TERMINAL_THEMES;
  selectedId: string;
  onSelect: (id: string) => void;
}) => (
  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
    {list.map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => onSelect(t.id)}
        className={cn(
          'flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
          selectedId === t.id
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
);

const TerminalTab = () => {
  const { mode, themeIds, setTerminalTheme, themes } = useTerminalTheme();

  const darkThemes = themes.filter((t) => t.variant === 'dark');
  const lightThemes = themes.filter((t) => t.variant === 'light');

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">터미널 테마</p>
        <p className="text-sm text-muted-foreground">모드별 터미널 색상 테마를 선택합니다.</p>
      </div>
      <Tabs defaultValue={mode}>
        <TabsList>
          <TabsTrigger value="dark">다크</TabsTrigger>
          <TabsTrigger value="light">라이트</TabsTrigger>
        </TabsList>
        <TabsContent value="dark" className="mt-3">
          <ThemeGrid list={darkThemes} selectedId={themeIds.dark} onSelect={(id) => setTerminalTheme('dark', id)} />
        </TabsContent>
        <TabsContent value="light" className="mt-3">
          <ThemeGrid list={lightThemes} selectedId={themeIds.light} onSelect={(id) => setTerminalTheme('light', id)} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const EditorTab = () => {
  const editorUrl = useConfigStore((state) => state.editorUrl);
  const setEditorUrl = useConfigStore((state) => state.setEditorUrl);
  const [localEditorUrl, setLocalEditorUrl] = useState(editorUrl);

  const isDirty = localEditorUrl.trim() !== editorUrl;

  const handleSave = () => {
    const trimmed = localEditorUrl.trim();
    setLocalEditorUrl(trimmed);
    setEditorUrl(trimmed);
    toast.success('저장되었습니다.');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium">에디터 URL</p>
          <p className="text-sm text-muted-foreground">
            헤더의 EDITOR 버튼 클릭 시 이동할 에디터 주소를 입력합니다.
          </p>
        </div>
        <Input
          placeholder="https://example.com:8080"
          value={localEditorUrl}
          onChange={(e) => setLocalEditorUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
        />
        <p className="text-sm text-muted-foreground">
          <a
            href="https://github.com/coder/code-server"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            code-server
          </a>
          를 설치하고 실행하면 브라우저에서 VS Code를 사용할 수 있습니다.
          URL에 <code className="rounded bg-muted px-1 py-0.5 text-xs">?folder=</code> 파라미터가 자동으로 추가됩니다.
        </p>
        <div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
          <p className="text-muted-foreground/60"># macOS 설치</p>
          <p>brew install code-server</p>
          <p className="mt-2 text-muted-foreground/60"># 실행</p>
          <p>code-server --port 8080</p>
          <p className="mt-2 text-muted-foreground/60"># Tailscale로 외부 접속 (선택)</p>
          <p>tailscale serve --bg --https=8443 http://localhost:8080</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button disabled={!isDirty} onClick={handleSave}>
          저장
        </Button>
      </div>
    </div>
  );
};

const ClaudeTab = () => {
  const dangerouslySkipPermissions = useConfigStore((state) => state.dangerouslySkipPermissions);
  const setDangerouslySkipPermissions = useConfigStore((state) => state.setDangerouslySkipPermissions);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="skip-permissions" className="text-sm font-medium">
            권한 확인 건너뛰기
          </Label>
          <p className="text-sm text-muted-foreground">
            Claude CLI 실행 시 --dangerously-skip-permissions 옵션을 추가합니다.
          </p>
        </div>
        <Switch
          id="skip-permissions"
          checked={dangerouslySkipPermissions}
          onCheckedChange={setDangerouslySkipPermissions}
        />
      </div>
    </div>
  );
};

const randomHex = (length: number): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
};

const AuthTab = () => {
  const hasAuthPassword = useConfigStore((state) => state.hasAuthPassword);
  const changePassword = useConfigStore((state) => state.changePassword);
  const [localPassword, setLocalPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);

  const hasStoredPassword = hasAuthPassword;
  const isDirty = passwordTouched && localPassword.trim().length >= 4;

  const handlePasswordChange = (value: string) => {
    setLocalPassword(value);
    setPasswordTouched(true);
  };

  const handleSave = () => {
    changePassword(localPassword.trim());
    setLocalPassword('');
    setPasswordTouched(false);
    toast.success('저장되었습니다. 서버 재시작 후 적용됩니다.');
  };

  return (
    <div className="space-y-6">
      <Field>
        <FieldLabel htmlFor="auth-password">비밀번호 변경</FieldLabel>
        <FieldDescription>
          새 비밀번호를 입력하면 SHA-512로 해싱되어 저장됩니다.
        </FieldDescription>
        <div className="flex gap-2">
          <Input
            id="auth-password"
            placeholder={hasStoredPassword ? '새 비밀번호 입력 (4자 이상)' : '비밀번호 입력 (4자 이상)'}
            value={localPassword}
            onChange={(e) => handlePasswordChange(e.target.value)}
          />
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => handlePasswordChange(randomHex(8))}>
            <Dices className="h-4 w-4" />
          </Button>
        </div>
      </Field>

      <FieldDescription>
        초기화하려면 ~/.purplemux/config.json 파일을 삭제하고 서버를 재시작하세요.
      </FieldDescription>

      <div className="flex justify-end">
        <Button disabled={!isDirty} onClick={handleSave}>
          저장
        </Button>
      </div>
    </div>
  );
};

const SystemTab = () => {
  const handleReset = () => {
    window.location.href = '/reset';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium">tmux 초기화</p>
          <p className="text-sm text-muted-foreground">
            tmux 세션을 모두 종료하고 서버를 재시작합니다.
            설정 변경 후 적용이 필요할 때 사용합니다.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="destructive" size="sm" className="gap-1.5 shrink-0">
                <RotateCcw className="h-3.5 w-3.5" />
                초기화
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>tmux 초기화</AlertDialogTitle>
              <AlertDialogDescription>
                실행 중인 모든 터미널 프로세스가 종료됩니다. 계속하시겠습니까?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                className="bg-ui-red hover:bg-ui-red/80"
                onClick={handleReset}
              >
                초기화
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
        className="inset-0 max-w-none sm:max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none p-0 md:inset-auto md:top-1/2 md:left-1/2 md:h-auto md:w-[calc(100%-2rem)] md:min-w-3xl md:max-w-3xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
        showCloseButton={false}
      >
        <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden md:h-[520px] md:flex-row">
          <div className="flex shrink-0 flex-col border-b bg-muted/30 px-3 pt-3 pb-0 md:p-3 md:w-48 md:border-b-0 md:border-r">
            <div className="mb-2 flex items-center justify-between px-2 md:mb-4">
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
            <nav className="flex gap-1 overflow-x-auto px-1 pb-2 md:flex-col md:px-0 md:pb-0">
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

          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
            <h2 className="mb-6 text-lg font-semibold">{activeItem?.label}</h2>
            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'terminal' && <TerminalTab />}
            {activeTab === 'editor' && <EditorTab />}
            {activeTab === 'claude' && <ClaudeTab />}
            {activeTab === 'auth' && <AuthTab />}
            {activeTab === 'tailscale' && <TailscaleSettings />}
            {activeTab === 'quick-prompts' && <QuickPromptsSettings />}
            {activeTab === 'system' && <SystemTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;

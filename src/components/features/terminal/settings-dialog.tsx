import { useState } from 'react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { Bot, Code, Dices, Lock, Monitor, Moon, Settings, Sun, Terminal, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import useTerminalTheme from '@/hooks/use-terminal-theme';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { TERMINAL_THEMES } from '@/lib/terminal-themes';
import type { ITerminalThemeColors } from '@/lib/terminal-themes';
import QuickPromptsSettings from '@/components/features/settings/quick-prompts-settings';

type TSettingsTab = 'general' | 'terminal' | 'editor' | 'claude' | 'auth' | 'quick-prompts';

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
    id: 'quick-prompts',
    label: '빠른 프롬프트',
    icon: <Zap className="h-4 w-4" />,
  },
];

const GeneralTab = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
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
  <div className="grid grid-cols-3 gap-2">
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
  const editorUrl = useWorkspaceStore((state) => state.editorUrl);
  const setEditorUrl = useWorkspaceStore((state) => state.setEditorUrl);
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
  const { dangerouslySkipPermissions, setDangerouslySkipPermissions } = useWorkspaceStore();

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
  const authPassword = useWorkspaceStore((state) => state.authPassword);
  const authSecret = useWorkspaceStore((state) => state.authSecret);
  const setAuthCredentials = useWorkspaceStore((state) => state.setAuthCredentials);
  const [localPassword, setLocalPassword] = useState(authPassword);
  const [localSecret, setLocalSecret] = useState(authSecret);

  const isDirty = localPassword.trim() !== authPassword || localSecret.trim() !== authSecret;

  const handleSave = () => {
    setAuthCredentials(localPassword.trim(), localSecret.trim());
    toast.success('저장되었습니다. 서버 재시작 후 적용됩니다.');
  };

  return (
    <div className="space-y-6">
      <Field>
        <FieldLabel htmlFor="auth-password">비밀번호</FieldLabel>
        <FieldDescription>로그인 시 사용할 비밀번호입니다.</FieldDescription>
        <div className="flex gap-2">
          <Input
            id="auth-password"
            placeholder="비워두면 랜덤 생성"
            value={localPassword}
            onChange={(e) => setLocalPassword(e.target.value)}
          />
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => setLocalPassword(randomHex(8))}>
            <Dices className="h-4 w-4" />
          </Button>
        </div>
      </Field>

      <Field>
        <FieldLabel htmlFor="auth-secret">시크릿</FieldLabel>
        <FieldDescription>JWT 서명에 사용되는 시크릿입니다.</FieldDescription>
        <div className="flex gap-2">
          <Input
            id="auth-secret"
            placeholder="비워두면 랜덤 생성"
            value={localSecret}
            onChange={(e) => setLocalSecret(e.target.value)}
          />
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => setLocalSecret(randomHex(64))}>
            <Dices className="h-4 w-4" />
          </Button>
        </div>
      </Field>

      <FieldDescription>
        두 값 모두 입력해야 고정됩니다. 비워두면 서버 시작 시 매번 랜덤 생성됩니다.
      </FieldDescription>

      <div className="flex justify-end">
        <Button disabled={!isDirty} onClick={handleSave}>
          저장
        </Button>
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
        <div className="flex h-[520px] flex-col md:flex-row">
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
            {activeTab === 'editor' && <EditorTab />}
            {activeTab === 'claude' && <ClaudeTab />}
            {activeTab === 'auth' && <AuthTab />}
            {activeTab === 'quick-prompts' && <QuickPromptsSettings />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import packageJson from '../../../../package.json';
import isElectron from '@/hooks/use-is-electron';
import { Bell, Check, ChevronDown, ChevronsUpDown, Code, Dices, Globe, Layout, Lock, Monitor, Moon, Network, Palette, RotateCcw, Settings, Sun, Terminal, Wrench, X, Zap } from 'lucide-react';
import ClaudeLogo from '@/components/icons/claude-logo';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import useTerminalTheme from '@/hooks/use-terminal-theme';
import useConfigStore from '@/hooks/use-config-store';
import { TERMINAL_THEMES } from '@/lib/terminal-themes';
import { EDITOR_PRESETS, buildEditorUrl, type TEditorPreset } from '@/lib/editor-url';
import { EditorIcon } from '@/components/icons/editor-icons';
import type { ITerminalThemeColors } from '@/lib/terminal-themes';
import QuickPromptsSettings from '@/components/features/settings/quick-prompts-settings';
import SidebarItemsSettings from '@/components/features/settings/sidebar-items-settings';
import TailscaleSettings from '@/components/features/settings/tailscale-settings';

type TSettingsTab = 'general' | 'appearance' | 'terminal' | 'notification' | 'editor' | 'claude' | 'auth' | 'tailscale' | 'quick-prompts' | 'sidebar-items' | 'system';

interface ISettingsItem {
  id: TSettingsTab;
  labelKey: string;
  icon: React.ReactNode;
  electronOnly?: boolean;
}

const settingsItems: ISettingsItem[] = [
  { id: 'general', labelKey: 'general', icon: <Settings className="h-4 w-4" /> },
  { id: 'appearance', labelKey: 'appearance', icon: <Palette className="h-4 w-4" /> },
  { id: 'terminal', labelKey: 'terminal', icon: <Terminal className="h-4 w-4" /> },
  { id: 'notification', labelKey: 'notification', icon: <Bell className="h-4 w-4" /> },
  { id: 'editor', labelKey: 'editor', icon: <Code className="h-4 w-4" /> },
  { id: 'claude', labelKey: 'claude', icon: <ClaudeLogo className="h-4 w-4" /> },
  { id: 'auth', labelKey: 'auth', icon: <Lock className="h-4 w-4" /> },
  { id: 'tailscale', labelKey: 'tailscale', icon: <Globe className="h-4 w-4" /> },
  { id: 'quick-prompts', labelKey: 'quickPrompts', icon: <Zap className="h-4 w-4" /> },
  { id: 'sidebar-items', labelKey: 'sidebarItems', icon: <Layout className="h-4 w-4" /> },
  { id: 'system', labelKey: 'system', icon: <Wrench className="h-4 w-4" /> },
];

const saveAppTheme = (value: string) => {
  fetch('/api/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appTheme: value }),
  }).catch(() => {});
  if ((window as unknown as Record<string, unknown>).electronAPI) {
    (window as unknown as { electronAPI: { setNativeTheme: (t: string) => void } }).electronAPI.setNativeTheme(value);
  }
};

const LOCALES = [
  { id: 'en', label: 'English' },
  { id: 'ko', label: '한국어' },
  { id: 'ja', label: '日本語' },
  { id: 'zh-CN', label: '中文（简体）' },
  { id: 'zh-TW', label: '中文（繁體）' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
  { id: 'pt-BR', label: 'Português (BR)' },
  { id: 'ru', label: 'Русский' },
  { id: 'tr', label: 'Türkçe' },
] as const;

const FONT_SIZES = [
  { id: 'normal', labelKey: 'fontSizeNormal' },
  { id: 'large', labelKey: 'fontSizeLarge' },
  { id: 'x-large', labelKey: 'fontSizeXLarge' },
] as const;

const GeneralTab = () => {
  const t = useTranslations('settings.general');
  const tc = useTranslations('common');
  const { theme, setTheme } = useTheme();
  const locale = useConfigStore((s) => s.locale);
  const setLocale = useConfigStore((s) => s.setLocale);
  const fontSize = useConfigStore((s) => s.fontSize);
  const setFontSize = useConfigStore((s) => s.setFontSize);

  const handleThemeChange = (value: string) => {
    setTheme(value);
    saveAppTheme(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium">{t('language')}</p>
          <p className="text-sm text-muted-foreground">{t('languageDescription')}</p>
        </div>
        <Popover>
          <PopoverTrigger
            className="inline-flex h-8 min-w-[180px] items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <span>{LOCALES.find((l) => l.id === locale)?.label ?? 'English'}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[180px] p-1">
            <div className="max-h-[280px] overflow-y-auto">
            {LOCALES.map((l) => (
              <button
                key={l.id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground',
                  locale === l.id && 'bg-accent text-accent-foreground',
                )}
                onClick={() => setLocale(l.id)}
              >
                <Check className={cn('h-3.5 w-3.5', locale === l.id ? 'opacity-100' : 'opacity-0')} />
                {l.label}
              </button>
            ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium">{t('theme')}</p>
          <p className="text-sm text-muted-foreground">{t('themeDescription')}</p>
        </div>
        <ButtonGroup>
          <Button variant={theme === 'light' ? 'default' : 'outline'} size="sm" onClick={() => handleThemeChange('light')}>
            <Sun className="h-4 w-4" />
            {tc('light')}
          </Button>
          <Button variant={theme === 'dark' ? 'default' : 'outline'} size="sm" onClick={() => handleThemeChange('dark')}>
            <Moon className="h-4 w-4" />
            {tc('dark')}
          </Button>
          <Button variant={theme === 'system' ? 'default' : 'outline'} size="sm" onClick={() => handleThemeChange('system')}>
            <Monitor className="h-4 w-4" />
            {tc('system')}
          </Button>
        </ButtonGroup>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium">{t('fontSize')}</p>
          <p className="text-sm text-muted-foreground">{t('fontSizeDescription')}</p>
        </div>
        <ButtonGroup>
          {FONT_SIZES.map((s) => (
            <Button key={s.id} variant={fontSize === s.id ? 'default' : 'outline'} size="sm" onClick={() => setFontSize(s.id)}>
              {t(s.labelKey)}
            </Button>
          ))}
        </ButtonGroup>
      </div>

      <a
        href="https://github.com/subicura/purplemux/releases"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-muted-foreground/50 hover:text-muted-foreground hover:underline w-fit"
      >
        {packageJson.version}({process.env.NEXT_PUBLIC_COMMIT_HASH})
      </a>
    </div>
  );
};

const CSS_VARIABLE_GROUPS = [
  {
    label: 'Surface',
    vars: ['--background', '--card', '--popover', '--muted', '--secondary', '--accent', '--sidebar'],
  },
  {
    label: 'Text',
    vars: ['--foreground', '--card-foreground', '--popover-foreground', '--muted-foreground', '--secondary-foreground', '--accent-foreground', '--sidebar-foreground'],
  },
  {
    label: 'Interactive',
    vars: ['--primary', '--primary-foreground', '--destructive'],
  },
  {
    label: 'Border',
    vars: ['--border', '--input', '--ring'],
  },
  {
    label: 'Palette',
    vars: ['--ui-blue', '--ui-teal', '--ui-coral', '--ui-amber', '--ui-purple', '--ui-pink', '--ui-green', '--ui-gray', '--ui-red'],
  },
  {
    label: 'Semantic',
    vars: ['--positive', '--negative', '--accent-color', '--brand', '--focus-indicator', '--claude-active'],
  },
] as const;

const AppearanceTab = () => {
  const t = useTranslations('settings.appearance');
  const tc = useTranslations('common');
  const customCSS = useConfigStore((s) => s.customCSS);
  const setCustomCSS = useConfigStore((s) => s.setCustomCSS);
  const [localCSS, setLocalCSS] = useState(customCSS);
  const [showVars, setShowVars] = useState(false);

  useEffect(() => {
    setLocalCSS(customCSS);
  }, [customCSS]);

  const isDirty = localCSS !== customCSS;

  const handleApply = () => {
    setCustomCSS(localCSS);
    toast.success(t('applied'));
  };

  const handleReset = () => {
    setLocalCSS('');
    setCustomCSS('');
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{t('customCSS')}</p>
        <p className="text-sm text-muted-foreground">{t('customCSSDescription')}</p>
      </div>

      <textarea
        className="h-56 w-full resize-y rounded-md border border-input bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:border-ring focus:outline-none"
        placeholder={t('placeholder')}
        value={localCSS}
        onChange={(e) => setLocalCSS(e.target.value)}
        spellCheck={false}
      />

      <div className="flex items-center justify-between">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="outline" size="sm" disabled={!customCSS}>
                {t('reset')}
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('reset')}</AlertDialogTitle>
              <AlertDialogDescription>{t('resetConfirm')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>{t('reset')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button size="sm" disabled={!isDirty} onClick={handleApply}>
          {t('apply')}
        </Button>
      </div>

      <div>
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowVars(!showVars)}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showVars && 'rotate-180')} />
          {t('availableVariables')}
        </button>
        {showVars && (
          <div className="mt-2 space-y-3">
            {CSS_VARIABLE_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">{group.label}</p>
                <div className="flex flex-wrap gap-1">
                  {group.vars.map((v) => (
                    <code key={v} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{v}</code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
  const t = useTranslations('settings.terminal');
  const tc = useTranslations('common');
  const { mode, themeIds, setTerminalTheme, themes } = useTerminalTheme();

  const darkThemes = themes.filter((th) => th.variant === 'dark');
  const lightThemes = themes.filter((th) => th.variant === 'light');

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{t('theme')}</p>
        <p className="text-sm text-muted-foreground">{t('themeDescription')}</p>
      </div>
      <Tabs defaultValue={mode}>
        <TabsList>
          <TabsTrigger value="dark">{tc('dark')}</TabsTrigger>
          <TabsTrigger value="light">{tc('light')}</TabsTrigger>
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
  const t = useTranslations('settings.editor');
  const tc = useTranslations('common');
  const editorUrl = useConfigStore((state) => state.editorUrl);
  const editorPreset = useConfigStore((state) => state.editorPreset);
  const setEditorUrl = useConfigStore((state) => state.setEditorUrl);
  const setEditorPreset = useConfigStore((state) => state.setEditorPreset);
  const [localEditorUrl, setLocalEditorUrl] = useState(editorUrl);
  const [localPreset, setLocalPreset] = useState<TEditorPreset>(editorPreset);

  const needsUrlInput = localPreset === 'code-server' || localPreset === 'custom';
  const isDirty = localPreset !== editorPreset || (needsUrlInput && localEditorUrl.trim() !== editorUrl);

  const previewUrl = buildEditorUrl(localPreset, localEditorUrl, '/Users/me/project');

  const handleSave = () => {
    const trimmed = needsUrlInput ? localEditorUrl.trim() : '';

    if (localPreset === 'code-server' && trimmed) {
      try {
        const url = new URL(trimmed);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          toast.error(t('errorHttpRequired'));
          return;
        }
      } catch {
        toast.error(t('errorHttpRequired'));
        return;
      }
    }

    if (localPreset === 'custom' && trimmed && !trimmed.includes('{folder}') && !trimmed.includes('{folderEncoded}')) {
      toast.error(t('errorCustomTemplate'));
      return;
    }

    setLocalEditorUrl(trimmed);
    setEditorUrl(trimmed);
    setEditorPreset(localPreset);
    toast.success(tc('saved'));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">{t('preset')}</p>
          <p className="text-sm text-muted-foreground">{t('presetDescription')}</p>
        </div>
        <RadioGroup
          value={localPreset}
          onValueChange={(value) => setLocalPreset(value as TEditorPreset)}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {EDITOR_PRESETS.map((preset) => (
            <Label
              key={preset}
              htmlFor={`editor-preset-${preset}`}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-normal',
                localPreset === preset && 'border-foreground/30 bg-accent',
              )}
            >
              <RadioGroupItem id={`editor-preset-${preset}`} value={preset} />
              <EditorIcon preset={preset} className="h-5 w-5 shrink-0" />
              {t(`presets.${preset}`)}
            </Label>
          ))}
        </RadioGroup>
      </div>

      {needsUrlInput && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {localPreset === 'custom' ? t('customTemplate') : t('url')}
          </p>
          <p className="text-sm text-muted-foreground">
            {localPreset === 'custom' ? t('customTemplateDescription') : t('urlDescription')}
          </p>
          <Input
            placeholder={localPreset === 'custom' ? 'myeditor://open?path={folderEncoded}' : 'https://example.com:8080'}
            value={localEditorUrl}
            onChange={(e) => setLocalEditorUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
          />
          {localPreset === 'code-server' && (
            <>
              <p className="text-sm text-muted-foreground">
                {t.rich('urlHelp', {
                  link: (chunks) => (
                    <a
                      href="https://github.com/coder/code-server"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      {chunks}
                    </a>
                  ),
                  code: () => <code className="rounded bg-muted px-1 py-0.5 text-xs">?folder=</code>,
                })}
              </p>
              <div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                <p className="text-muted-foreground/60"># Install on macOS</p>
                <p>brew install code-server</p>
                <p className="mt-2 text-muted-foreground/60"># Run</p>
                <p>code-server --port 8080</p>
                <p className="mt-2 text-muted-foreground/60"># External access via Tailscale (optional)</p>
                <p>tailscale serve --bg --https=8443 http://localhost:8080</p>
              </div>
            </>
          )}
          {localPreset === 'custom' && (
            <p className="text-sm text-muted-foreground">
              {t.rich('customHelp', {
                folder: () => <code className="rounded bg-muted px-1 py-0.5 text-xs">{'{folder}'}</code>,
                folderEncoded: () => <code className="rounded bg-muted px-1 py-0.5 text-xs">{'{folderEncoded}'}</code>,
              })}
            </p>
          )}
        </div>
      )}

      {!needsUrlInput && (
        <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {t('localIdeHint')}
        </p>
      )}

      {previewUrl && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t('preview')}</p>
          <code className="block break-all rounded-md bg-muted p-2 font-mono text-xs">
            {previewUrl}
          </code>
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={!isDirty} onClick={handleSave}>
          {tc('save')}
        </Button>
      </div>
    </div>
  );
};

const ClaudeTab = () => {
  const t = useTranslations('settings.claude');
  const dangerouslySkipPermissions = useConfigStore((state) => state.dangerouslySkipPermissions);
  const setDangerouslySkipPermissions = useConfigStore((state) => state.setDangerouslySkipPermissions);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="skip-permissions" className="text-sm font-medium">
            {t('skipPermissions')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('skipPermissionsDescription')}
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

const NotificationTab = () => {
  const t = useTranslations('settings.notification');
  const notificationsEnabled = useConfigStore((state) => state.notificationsEnabled);
  const setNotificationsEnabled = useConfigStore((state) => state.setNotificationsEnabled);

  const showWebPushHint = typeof window !== 'undefined'
    && !((window as unknown as Record<string, unknown>).electronAPI)
    && !('PushManager' in window);

  const showDeniedHint = typeof window !== 'undefined'
    && !((window as unknown as Record<string, unknown>).electronAPI)
    && 'Notification' in window
    && Notification.permission === 'denied';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="notifications-enabled" className="text-sm font-medium">
            {t('enable')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('enableDescription')}
          </p>
        </div>
        <Switch
          id="notifications-enabled"
          checked={notificationsEnabled}
          onCheckedChange={setNotificationsEnabled}
          disabled={showWebPushHint || showDeniedHint}
        />
      </div>
      {showDeniedHint && (
        <p className="text-sm text-destructive">{t('permissionDenied')}</p>
      )}
      {showWebPushHint && (
        <p className="text-sm text-muted-foreground">{t('notSupported')}</p>
      )}
    </div>
  );
};

const randomHex = (length: number): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
};

const AuthTab = () => {
  const t = useTranslations('settings.auth');
  const tc = useTranslations('common');
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
    toast.success(t('savedRestart', { action: isElectron ? t('restartAppAction') : t('restartServerAction') }));
  };

  return (
    <div className="space-y-6">
      <Field>
        <FieldLabel htmlFor="auth-password">{t('changePassword')}</FieldLabel>
        <FieldDescription>
          {t('changePasswordDescription')}
        </FieldDescription>
        <div className="flex gap-2">
          <Input
            id="auth-password"
            placeholder={hasStoredPassword ? t('newPasswordPlaceholder') : t('passwordPlaceholder')}
            value={localPassword}
            onChange={(e) => handlePasswordChange(e.target.value)}
          />
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => handlePasswordChange(randomHex(8))}>
            <Dices className="h-4 w-4" />
          </Button>
        </div>
      </Field>

      <FieldDescription>
        {t('resetHint', { action: isElectron ? t('restartApp') : t('restartServer') })}
      </FieldDescription>

      <div className="flex justify-end">
        <Button disabled={!isDirty} onClick={handleSave}>
          {tc('save')}
        </Button>
      </div>
    </div>
  );
};

const SystemTab = () => {
  const t = useTranslations('settings.system');
  const tc = useTranslations('common');
  const systemResourcesEnabled = useConfigStore((s) => s.systemResourcesEnabled);
  const setSystemResourcesEnabled = useConfigStore((s) => s.setSystemResourcesEnabled);
  const networkAccess = useConfigStore((s) => s.networkAccess);
  const setNetworkAccess = useConfigStore((s) => s.setNetworkAccess);
  const hostEnvLocked = useConfigStore((s) => s.hostEnvLocked);
  const bindHostIsLocal = useConfigStore((s) => s.bindHostIsLocal);

  const [pendingNetworkAccess, setPendingNetworkAccess] = useState(networkAccess);
  useEffect(() => {
    setPendingNetworkAccess(networkAccess);
  }, [networkAccess]);
  const hasNetworkAccessChange = pendingNetworkAccess !== networkAccess;
  const needsRestart = bindHostIsLocal && pendingNetworkAccess !== 'localhost';

  const handleSaveNetworkAccess = () => {
    setNetworkAccess(pendingNetworkAccess);
    toast.success(needsRestart ? t('restartRequired') : tc('saved'));
  };

  const handleReset = () => {
    window.location.href = '/reset';
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <Network className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="flex-1 space-y-0.5">
            <p className="text-sm font-medium">{t('networkAccess')}</p>
            <p className="text-sm text-muted-foreground">
              {hostEnvLocked ? t('networkAccessLocked') : t('networkAccessDescription')}
            </p>
          </div>
        </div>
        <RadioGroup
          value={pendingNetworkAccess}
          onValueChange={(v) => setPendingNetworkAccess(v as typeof pendingNetworkAccess)}
          disabled={hostEnvLocked}
          className="gap-2"
        >
          {(['localhost', 'tailscale', 'all'] as const).map((opt) => (
            <label
              key={opt}
              htmlFor={`network-access-${opt}`}
              className="flex cursor-pointer items-start gap-3 rounded-md border bg-background px-3 py-2.5 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              aria-disabled={hostEnvLocked || undefined}
            >
              <RadioGroupItem value={opt} id={`network-access-${opt}`} className="mt-0.5" />
              <div className="flex-1 space-y-0.5">
                <p className="text-sm font-medium">{t(`networkAccessOptions.${opt}.label`)}</p>
                <p className="text-xs text-muted-foreground">{t(`networkAccessOptions.${opt}.description`)}</p>
              </div>
            </label>
          ))}
        </RadioGroup>
        {!hostEnvLocked && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {needsRestart ? t('restartRequired') : ''}
            </p>
            <Button
              size="sm"
              onClick={handleSaveNetworkAccess}
              disabled={!hasNetworkAccessChange}
            >
              {tc('save')}
            </Button>
          </div>
        )}
      </div>

      {isElectron && (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="system-resources" className="text-sm font-medium">
              {t('showResources')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('showResourcesDescription')}
            </p>
          </div>
          <Switch
            id="system-resources"
            checked={systemResourcesEnabled}
            onCheckedChange={setSystemResourcesEnabled}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium">{t('tmuxReset')}</p>
          <p className="text-sm text-muted-foreground">
            {t('tmuxResetDescription', { action: isElectron ? t('restartApp') : t('restartServer') })}
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="destructive" size="sm" className="gap-1.5 shrink-0">
                <RotateCcw className="h-3.5 w-3.5" />
                {tc('reset')}
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('tmuxReset')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('tmuxResetConfirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-ui-red hover:bg-ui-red/80"
                onClick={handleReset}
              >
                {tc('reset')}
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
  const t = useTranslations('settings');
  const tc = useTranslations('common');
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
              <DialogTitle className="text-base font-semibold">{t('title')}</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-6 w-6 opacity-70 hover:opacity-100"
              >
                <X className="h-[18px] w-[18px]" />
                <span className="sr-only">{tc('close')}</span>
              </Button>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-1 pb-2 md:flex-col md:px-0 md:pb-0">
              {settingsItems.filter((item) => !item.electronOnly || isElectron).map((item) => (
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
                  {t(`tabs.${item.labelKey}`)}
                </Button>
              ))}
            </nav>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
            <h2 className="mb-6 text-lg font-semibold">{activeItem ? t(`tabs.${activeItem.labelKey}`) : ''}</h2>
            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'appearance' && <AppearanceTab />}
            {activeTab === 'terminal' && <TerminalTab />}
            {activeTab === 'notification' && <NotificationTab />}
            {activeTab === 'editor' && <EditorTab />}
            {activeTab === 'claude' && <ClaudeTab />}
            {activeTab === 'auth' && <AuthTab />}
            {activeTab === 'tailscale' && <TailscaleSettings />}
            {activeTab === 'quick-prompts' && <QuickPromptsSettings />}
            {activeTab === 'sidebar-items' && <SidebarItemsSettings />}
            {activeTab === 'system' && <SystemTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;

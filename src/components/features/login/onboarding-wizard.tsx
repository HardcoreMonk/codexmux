import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Download, Eye, EyeOff, Globe, ListChecks, Lock, Loader2, LogIn, Network, RefreshCcw, Terminal, Sun, Moon, Monitor, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { TERMINAL_THEMES, DEFAULT_THEME_IDS } from '@/lib/terminal-themes';
import type { ITerminalThemeColors } from '@/lib/terminal-themes';
import AppLogo from '@/components/layout/app-logo';
import InstallDialog from '@/components/features/login/install-dialog';
import { usePreflight } from '@/hooks/use-preflight';
import useConfigStore from '@/hooks/use-config-store';
import type { IPreflightResult } from '@/types/preflight';
import { LOCALE_OPTIONS } from '@/lib/locales';

type TStep = 'preflight' | 'password' | 'language' | 'appearance' | 'theme' | 'network' | 'complete';
type TAppTheme = 'dark' | 'light' | 'system';
type TNetworkAccess = 'localhost' | 'tailscale' | 'all';

const ALL_STEPS: TStep[] = ['preflight', 'password', 'language', 'appearance', 'theme', 'network', 'complete'];

const NETWORK_ACCESS_OPTIONS: TNetworkAccess[] = ['localhost', 'tailscale', 'all'];

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
  <div className="grid grid-cols-2 gap-2">
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

const StepIndicator = ({ current, steps }: { current: TStep; steps: TStep[] }) => {
  const currentIndex = steps.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-1.5">
      {steps.map((step, i) => (
        <div
          key={step}
          className={cn(
            'h-1.5 rounded-full transition-all',
            i === currentIndex ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30',
          )}
        />
      ))}
    </div>
  );
};

const STEP_ICONS: Record<TStep, React.ReactNode> = {
  preflight: <ListChecks className="h-5 w-5" />,
  password: <Lock className="h-5 w-5" />,
  language: <Globe className="h-5 w-5" />,
  appearance: <Sun className="h-5 w-5" />,
  theme: <Terminal className="h-5 w-5" />,
  network: <Network className="h-5 w-5" />,
  complete: <Check className="h-5 w-5" />,
};

interface IOnboardingWizardProps {
  onComplete: () => void;
  hostEnvLocked?: boolean;
}

const readPreflightAgent = (status: IPreflightResult) => status.agent;

const OnboardingWizard = ({ onComplete, hostEnvLocked = false }: IOnboardingWizardProps) => {
  const t = useTranslations('onboarding');
  const tc = useTranslations('common');
  const { theme: currentTheme, setTheme: setNextTheme } = useTheme();
  const [step, setStep] = useState<TStep>('preflight');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [appTheme, setAppTheme] = useState<TAppTheme>((currentTheme as TAppTheme) ?? 'dark');
  const [darkTheme, setDarkTheme] = useState(DEFAULT_THEME_IDS.dark);
  const [lightTheme, setLightTheme] = useState(DEFAULT_THEME_IDS.light);
  const [networkAccess, setNetworkAccess] = useState<TNetworkAccess>('localhost');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { status: preflightStatus, checking: preflightChecking } = usePreflight({
    onReady: (data) => {
      const agent = readPreflightAgent(data);
      if (data.tmux.installed && data.tmux.compatible && data.git.installed && agent.installed && agent.loggedIn) {
        setStep('password');
      }
    },
  });
  const preflightAgent = preflightStatus ? readPreflightAgent(preflightStatus) : null;
  const [installTarget, setInstallTarget] = useState<{ command: string; label: string } | null>(null);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const storeLocale = useConfigStore((s) => s.locale);
  const setStoreLocale = useConfigStore((s) => s.setLocale);
  const [selectedLocale, setSelectedLocale] = useState(storeLocale);

  useEffect(() => {
    if (step === 'password') {
      document.getElementById('setup-password')?.focus();
    }
  }, [step]);

  const appThemeOptions: { value: TAppTheme; icon: React.ReactNode; label: string }[] = [
    { value: 'dark', icon: <Moon className="h-4 w-4" />, label: tc('dark') },
    { value: 'light', icon: <Sun className="h-4 w-4" />, label: tc('light') },
    { value: 'system', icon: <Monitor className="h-4 w-4" />, label: tc('system') },
  ];

  const steps = hostEnvLocked ? ALL_STEPS.filter((s) => s !== 'network') : ALL_STEPS;
  const stepIndex = steps.indexOf(step);

  const goNext = () => {
    const next = steps[stepIndex + 1];
    if (next) { setDirection('forward'); setStep(next); }
  };

  const goBack = () => {
    const prev = steps[stepIndex - 1];
    if (prev) { setDirection('back'); setStep(prev); }
  };

  const stepPanelClass = (s: TStep) =>
    cn(
      'flex flex-col gap-4 [grid-area:1/1] transition-all duration-200 ease-out',
      step === s
        ? 'opacity-100'
        : cn('opacity-0 pointer-events-none', direction === 'forward' ? 'translate-x-2' : '-translate-x-2'),
    );

  const canProceed = () => {
    if (step === 'password') {
      return password.length >= 4 && password === confirmPassword;
    }
    return true;
  };

  const handleLocaleChange = (id: string) => {
    setSelectedLocale(id);
    setStoreLocale(id);
  };

  const handlePasswordNext = () => {
    if (password.length < 4) {
      setError(t('passwordMinLength'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }
    setError('');
    goNext();
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authPassword: password,
          locale: selectedLocale,
          appTheme,
          terminalTheme: { light: lightTheme, dark: darkTheme },
          ...(hostEnvLocked ? {} : { networkAccess }),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t('setupFailed'));
        setIsSubmitting(false);
        return;
      }

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (loginRes.ok) {
        window.location.href = '/';
        return;
      }

      onComplete();
    } catch {
      setError(t('connectionError'));
      setIsSubmitting(false);
    }
  };

  const darkThemes = TERMINAL_THEMES.filter((th) => th.variant === 'dark');
  const lightThemes = TERMINAL_THEMES.filter((th) => th.variant === 'light');

  return (
    <div className="flex flex-col gap-6">
      <AppLogo shimmer size="xl" className="justify-center" />

      <StepIndicator current={step} steps={steps} />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {STEP_ICONS[step]}
        <span className="font-medium text-foreground">{t(`steps.${step}`)}</span>
      </div>

      <div className="grid">
        <div className={stepPanelClass('preflight')} aria-hidden={step !== 'preflight'}>
          {preflightChecking ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">{t('checking')}</span>
            </div>
          ) : preflightStatus && preflightAgent && preflightStatus.tmux.installed && preflightStatus.tmux.compatible &&
            preflightStatus.git.installed && preflightAgent.installed &&
            !preflightAgent.loggedIn ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t('codexLoginDescription')}</p>
              <div className="flex flex-col gap-2">
                <Button
                  size="lg"
                  className="h-12 w-full"
                  onClick={() => setInstallTarget({ command: 'codex-login', label: t('codexLogin') })}
                >
                  <LogIn className="mr-1 h-4 w-4" />
                  {t('codexLogin')}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 w-full"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCcw className="mr-1 h-4 w-4" />
                  {tc('refresh')}
                </Button>
              </div>
              {installTarget && (
                <InstallDialog
                  open
                  onOpenChange={() => setInstallTarget(null)}
                  command={installTarget.command}
                  label={installTarget.label}
                />
              )}
            </div>
          ) : preflightStatus && !(
            preflightStatus.tmux.installed && preflightStatus.tmux.compatible &&
            preflightStatus.git.installed &&
            preflightAgent?.installed
          ) ? (() => {
            const agent = preflightStatus.agent;
            const codexNeedsPath = !agent.installed && !!agent.binaryPath;
            const brewInstalled = preflightStatus.brew?.installed ?? true;
            const cltInstalled = preflightStatus.clt?.installed ?? true;
            const missingTools: { name: string; show: boolean }[] = [
              { name: 'Command Line Tools', show: !cltInstalled && !brewInstalled },
              { name: 'Homebrew', show: !brewInstalled },
              { name: 'tmux', show: !(preflightStatus.tmux.installed && preflightStatus.tmux.compatible) },
              { name: 'Git', show: !preflightStatus.git.installed },
              { name: codexNeedsPath ? t('codexPathMissing') : 'Codex CLI', show: !agent.installed },
            ];

            const needsUpgrade = preflightStatus.tmux.installed && !preflightStatus.tmux.compatible;
            const nextInstall =
              !cltInstalled && !brewInstalled
                ? { command: 'clt', label: t('installClt') }
              : !brewInstalled
                ? { command: 'brew', label: t('installBrew') }
              : !(preflightStatus.tmux.installed && preflightStatus.tmux.compatible)
                ? { command: needsUpgrade ? 'tmux-upgrade' : 'tmux-install', label: needsUpgrade ? t('upgradeTmux') : t('installTmux') }
              : !preflightStatus.git.installed
                ? { command: 'git', label: t('installGit') }
              : codexNeedsPath
                ? { command: 'codex-path', label: t('fixCodexPath') }
              : { command: 'codex', label: t('installCodex') };

            return (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-ui-amber">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">{t('missingTools')}</p>
              </div>
              <div className="space-y-1.5">
                {missingTools.filter((t) => t.show).map((tool) => (
                  <div key={tool.name} className="flex items-center gap-2 text-sm">
                    <X className="h-4 w-4 shrink-0 text-negative" />
                    <span className="text-foreground font-medium">{tool.name}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  size="lg"
                  className="h-12 w-full"
                  onClick={() => setInstallTarget(nextInstall)}
                >
                  <Download className="mr-1 h-4 w-4" />
                  {nextInstall.label}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 w-full"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCcw className="mr-1 h-4 w-4" />
                  {tc('refresh')}
                </Button>
              </div>
              {installTarget && (
                <InstallDialog
                  open
                  onOpenChange={() => setInstallTarget(null)}
                  command={installTarget.command}
                  label={installTarget.label}
                />
              )}
            </div>
            );
          })() : null}
        </div>

        <div className={stepPanelClass('password')} aria-hidden={step !== 'password'}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-password">{t('password')}</Label>
            <div className="relative">
              <Input
                id="setup-password"
                type={showPassword ? 'text' : 'password'}
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                tabIndex={step === 'password' ? 0 : -1}
                className="h-12 pr-10 text-base"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={step === 'password' ? 0 : -1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-confirm">{t('confirmPassword')}</Label>
            <Input
              id="setup-confirm"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canProceed()) handlePasswordNext();
              }}
              tabIndex={step === 'password' ? 0 : -1}
              className="h-12 text-base"
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button size="lg" className="h-12 w-full" disabled={!canProceed()} tabIndex={step === 'password' ? 0 : -1} onClick={handlePasswordNext}>
            {tc('next')}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>

        <div className={stepPanelClass('language')} aria-hidden={step !== 'language'}>
          <p className="text-sm text-muted-foreground">{t('languageDescription')}</p>
          <div className="grid grid-cols-2 gap-2">
            {LOCALE_OPTIONS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => handleLocaleChange(l.id)}
                tabIndex={step === 'language' ? 0 : -1}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                  selectedLocale === l.id
                    ? 'border-primary bg-accent'
                    : 'border-border hover:border-muted-foreground/50',
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="h-12" tabIndex={step === 'language' ? 0 : -1} onClick={goBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {tc('back')}
            </Button>
            <Button size="lg" className="h-12 flex-1" tabIndex={step === 'language' ? 0 : -1} onClick={goNext}>
              {tc('next')}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className={stepPanelClass('appearance')} aria-hidden={step !== 'appearance'}>
          <p className="text-sm text-muted-foreground">{t('appearanceDescription')}</p>
          <div className="grid grid-cols-3 gap-2">
            {appThemeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setAppTheme(opt.value); setNextTheme(opt.value); }}
                tabIndex={step === 'appearance' ? 0 : -1}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors',
                  appTheme === opt.value
                    ? 'border-primary bg-accent'
                    : 'border-border hover:border-muted-foreground/50',
                )}
              >
                {opt.icon}
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="h-12" tabIndex={step === 'appearance' ? 0 : -1} onClick={goBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {tc('back')}
            </Button>
            <Button size="lg" className="h-12 flex-1" tabIndex={step === 'appearance' ? 0 : -1} onClick={goNext}>
              {tc('next')}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className={stepPanelClass('theme')} aria-hidden={step !== 'theme'}>
          <Tabs defaultValue="dark">
            <TabsList className="w-full">
              <TabsTrigger value="dark" className="flex-1" tabIndex={step === 'theme' ? 0 : -1}>{tc('dark')}</TabsTrigger>
              <TabsTrigger value="light" className="flex-1" tabIndex={step === 'theme' ? 0 : -1}>{tc('light')}</TabsTrigger>
            </TabsList>
            <TabsContent value="dark" className="mt-3">
              <ThemeGrid list={darkThemes} selectedId={darkTheme} onSelect={setDarkTheme} />
            </TabsContent>
            <TabsContent value="light" className="mt-3">
              <ThemeGrid list={lightThemes} selectedId={lightTheme} onSelect={setLightTheme} />
            </TabsContent>
          </Tabs>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="h-12" tabIndex={step === 'theme' ? 0 : -1} onClick={goBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {tc('back')}
            </Button>
            <Button size="lg" className="h-12 flex-1" tabIndex={step === 'theme' ? 0 : -1} onClick={goNext}>
              {tc('next')}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className={stepPanelClass('network')} aria-hidden={step !== 'network'}>
          <p className="text-sm text-muted-foreground">{t('networkDescription')}</p>
          <div className="flex flex-col gap-2">
            {NETWORK_ACCESS_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setNetworkAccess(opt)}
                tabIndex={step === 'network' ? 0 : -1}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                  networkAccess === opt
                    ? 'border-primary bg-accent'
                    : 'border-border hover:border-muted-foreground/50',
                )}
              >
                <span className="text-sm font-medium">{t(`networkOptions.${opt}.label`)}</span>
                <span className="text-xs text-muted-foreground">{t(`networkOptions.${opt}.hint`)}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t('networkFootnote')}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="h-12" tabIndex={step === 'network' ? 0 : -1} onClick={goBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {tc('back')}
            </Button>
            <Button size="lg" className="h-12 flex-1" tabIndex={step === 'network' ? 0 : -1} onClick={goNext}>
              {tc('next')}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className={stepPanelClass('complete')} aria-hidden={step !== 'complete'}>
          <div className="rounded-lg border p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('summary.password')}</span>
              <span className="font-mono">{'*'.repeat(password.length)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('summary.language')}</span>
              <span>{LOCALE_OPTIONS.find((l) => l.id === selectedLocale)?.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('summary.appTheme')}</span>
              <span>{appThemeOptions.find((o) => o.value === appTheme)?.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('summary.darkTheme')}</span>
              <span>{TERMINAL_THEMES.find((th) => th.id === darkTheme)?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('summary.lightTheme')}</span>
              <span>{TERMINAL_THEMES.find((th) => th.id === lightTheme)?.name}</span>
            </div>
            {!hostEnvLocked && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('summary.networkAccess')}</span>
                <span>{t(`networkOptions.${networkAccess}.label`)}</span>
              </div>
            )}
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="h-12" tabIndex={step === 'complete' ? 0 : -1} onClick={goBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {tc('back')}
            </Button>
            <Button size="lg" className="h-12 flex-1" disabled={isSubmitting} tabIndex={step === 'complete' ? 0 : -1} onClick={handleSubmit}>
              <Check className="mr-1 h-4 w-4" />
              {isSubmitting ? t('submitting') : t('completeButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;

import { useState } from 'react';
import { useTheme } from 'next-themes';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Lock, Terminal, Bot, Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { TERMINAL_THEMES, DEFAULT_THEME_IDS } from '@/lib/terminal-themes';
import type { ITerminalThemeColors } from '@/lib/terminal-themes';
import AppLogo from '@/components/layout/app-logo';

type TStep = 'password' | 'appearance' | 'theme' | 'claude' | 'complete';
type TAppTheme = 'dark' | 'light' | 'system';

const STEPS: TStep[] = ['password', 'appearance', 'theme', 'claude', 'complete'];

const STEP_INFO: Record<TStep, { icon: React.ReactNode; title: string }> = {
  password: { icon: <Lock className="h-5 w-5" />, title: '비밀번호 설정' },
  appearance: { icon: <Sun className="h-5 w-5" />, title: '화면 테마' },
  theme: { icon: <Terminal className="h-5 w-5" />, title: '터미널 테마' },
  claude: { icon: <Bot className="h-5 w-5" />, title: 'Claude 설정' },
  complete: { icon: <Check className="h-5 w-5" />, title: '설정 완료' },
};

const APP_THEME_OPTIONS: { value: TAppTheme; icon: React.ReactNode; label: string }[] = [
  { value: 'dark', icon: <Moon className="h-4 w-4" />, label: '다크' },
  { value: 'light', icon: <Sun className="h-4 w-4" />, label: '라이트' },
  { value: 'system', icon: <Monitor className="h-4 w-4" />, label: '시스템' },
];

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

const StepIndicator = ({ current }: { current: TStep }) => {
  const currentIndex = STEPS.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-1.5">
      {STEPS.map((step, i) => (
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

interface IOnboardingWizardProps {
  onComplete: () => void;
}

const OnboardingWizard = ({ onComplete }: IOnboardingWizardProps) => {
  const { theme: currentTheme, setTheme: setNextTheme } = useTheme();
  const [step, setStep] = useState<TStep>('password');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [appTheme, setAppTheme] = useState<TAppTheme>((currentTheme as TAppTheme) ?? 'dark');
  const [darkTheme, setDarkTheme] = useState(DEFAULT_THEME_IDS.dark);
  const [lightTheme, setLightTheme] = useState(DEFAULT_THEME_IDS.light);
  const [skipPermissions, setSkipPermissions] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const info = STEP_INFO[step];

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const canProceed = () => {
    if (step === 'password') {
      return password.length >= 4 && password === confirmPassword;
    }
    return true;
  };

  const handlePasswordNext = () => {
    if (password.length < 4) {
      setError('비밀번호는 4자 이상이어야 합니다.');
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
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
          appTheme,
          terminalTheme: { light: lightTheme, dark: darkTheme },
          dangerouslySkipPermissions: skipPermissions,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '설정에 실패했습니다.');
        setIsSubmitting(false);
        return;
      }

      onComplete();
    } catch {
      setError('서버에 연결할 수 없습니다.');
      setIsSubmitting(false);
    }
  };

  const darkThemes = TERMINAL_THEMES.filter((t) => t.variant === 'dark');
  const lightThemes = TERMINAL_THEMES.filter((t) => t.variant === 'light');

  return (
    <div className="flex flex-col gap-6">
      <AppLogo shimmer size="xl" className="justify-center" />

      <StepIndicator current={step} />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {info.icon}
        <span className="font-medium text-foreground">{info.title}</span>
      </div>

      {step === 'password' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-password">비밀번호</Label>
            <div className="relative">
              <Input
                id="setup-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="4자 이상 입력"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                autoFocus
                className="h-12 pr-10 text-base"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-confirm">비밀번호 확인</Label>
            <Input
              id="setup-confirm"
              type={showPassword ? 'text' : 'password'}
              placeholder="비밀번호를 다시 입력"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canProceed()) handlePasswordNext();
              }}
              className="h-12 text-base"
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button size="lg" className="h-12 w-full" disabled={!canProceed()} onClick={handlePasswordNext}>
            다음
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {step === 'appearance' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">앱 전체의 화면 테마를 선택합니다.</p>
          <div className="grid grid-cols-3 gap-2">
            {APP_THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setAppTheme(opt.value); setNextTheme(opt.value); }}
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
            <Button variant="outline" size="lg" className="h-12" onClick={goBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              이전
            </Button>
            <Button size="lg" className="h-12 flex-1" onClick={goNext}>
              다음
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 'theme' && (
        <div className="flex flex-col gap-4">
          <Tabs defaultValue="dark">
            <TabsList className="w-full">
              <TabsTrigger value="dark" className="flex-1">다크</TabsTrigger>
              <TabsTrigger value="light" className="flex-1">라이트</TabsTrigger>
            </TabsList>
            <TabsContent value="dark" className="mt-3">
              <ThemeGrid list={darkThemes} selectedId={darkTheme} onSelect={setDarkTheme} />
            </TabsContent>
            <TabsContent value="light" className="mt-3">
              <ThemeGrid list={lightThemes} selectedId={lightTheme} onSelect={setLightTheme} />
            </TabsContent>
          </Tabs>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="h-12" onClick={goBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              이전
            </Button>
            <Button size="lg" className="h-12 flex-1" onClick={goNext}>
              다음
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 'claude' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1 pr-4">
              <p className="text-sm font-medium">권한 확인 건너뛰기</p>
              <p className="text-sm text-muted-foreground">
                Claude CLI 실행 시 --dangerously-skip-permissions 옵션을 추가합니다.
              </p>
            </div>
            <Switch
              checked={skipPermissions}
              onCheckedChange={setSkipPermissions}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="h-12" onClick={goBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              이전
            </Button>
            <Button size="lg" className="h-12 flex-1" onClick={goNext}>
              다음
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 'complete' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">비밀번호</span>
              <span className="font-mono">{'*'.repeat(password.length)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">화면 테마</span>
              <span>{APP_THEME_OPTIONS.find((o) => o.value === appTheme)?.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">다크 테마</span>
              <span>{TERMINAL_THEMES.find((t) => t.id === darkTheme)?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">라이트 테마</span>
              <span>{TERMINAL_THEMES.find((t) => t.id === lightTheme)?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">권한 건너뛰기</span>
              <span>{skipPermissions ? '사용' : '사용 안 함'}</span>
            </div>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="h-12" onClick={goBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              이전
            </Button>
            <Button size="lg" className="h-12 flex-1" disabled={isSubmitting} onClick={handleSubmit}>
              <Check className="mr-1 h-4 w-4" />
              {isSubmitting ? '설정 중...' : '설정 완료'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingWizard;

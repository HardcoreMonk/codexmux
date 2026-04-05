import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AlertTriangle, Check, HelpCircle, Lock, RefreshCcw, X } from 'lucide-react';
import AppLogo from '@/components/layout/app-logo';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEffect, useState } from 'react';
import isElectron from '@/hooks/use-is-electron';

interface IToolStatus {
  installed: boolean;
  version: string | null;
}

interface IPreflightResult {
  tmux: IToolStatus & { compatible: boolean };
  git: IToolStatus;
  claude: IToolStatus;
  brew: IToolStatus;
}

interface IToolCheck {
  name: string;
  ok: boolean;
  version: string | null;
  install: string;
}

const getToolChecks = (status: IPreflightResult): IToolCheck[] => [
  {
    name: 'tmux',
    ok: status.tmux.installed && status.tmux.compatible,
    version: status.tmux.version,
    install: status.tmux.installed && !status.tmux.compatible ? 'brew upgrade tmux' : 'brew install tmux',
  },
  {
    name: 'git',
    ok: status.git.installed,
    version: status.git.version,
    install: 'brew install git',
  },
  {
    name: 'claude',
    ok: status.claude.installed,
    version: status.claude.version,
    install: 'npm install -g @anthropic-ai/claude-code',
  },
];

const PreflightError = ({ checks }: { checks: IToolCheck[] }) => {
  const failedChecks = checks.filter((c) => !c.ok);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-amber-400">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <p className="text-sm font-medium">필수 도구가 누락되었습니다</p>
      </div>
      <div className="space-y-1.5">
        {checks.map((check) => (
          <div key={check.name} className="flex items-center gap-2 text-sm">
            {check.ok ? (
              <Check className="h-4 w-4 shrink-0 text-green-400" />
            ) : (
              <X className="h-4 w-4 shrink-0 text-red-400" />
            )}
            <span className={check.ok ? 'text-muted-foreground' : 'text-foreground font-medium'}>
              {check.name}
            </span>
            {check.version && (
              <span className="text-xs text-muted-foreground">({check.version})</span>
            )}
          </div>
        ))}
      </div>
      <div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
        <p className="text-muted-foreground/60"># 설치</p>
        {failedChecks.map((check) => (
          <p key={check.name}>{check.install}</p>
        ))}
      </div>
      <Button
        variant="outline"
        size="lg"
        className="h-12 w-full"
        onClick={() => window.location.reload()}
      >
        <RefreshCcw className="mr-1 h-4 w-4" />
        새로고침
      </Button>
    </div>
  );
};

export const LoginForm = ({ className, ...props }: React.ComponentProps<'div'>) => {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [toolChecks, setToolChecks] = useState<IToolCheck[] | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/preflight');
        const data: IPreflightResult = await res.json();
        setToolChecks(getToolChecks(data));
      } catch {
        // preflight 실패 시 로그인 폼 표시
      } finally {
        setChecking(false);
      }
    };
    check();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setError('');

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? '비밀번호가 올바르지 않습니다.');
      setIsLoading(false);
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <div className="flex flex-col gap-14">
        <AppLogo shimmer size="xl" className="justify-center" />
        {checking ? (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          </div>
        ) : toolChecks?.some((c) => !c.ok) ? (
          <PreflightError checks={toolChecks} />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                autoFocus
                className="h-12 text-base"
              />
              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
            <Button type="submit" disabled={isLoading || !password} size="lg" className="h-12 w-full">
              <Lock className="size-4" />
              {isLoading ? '로그인 중...' : '로그인'}
            </Button>
            <div className="flex items-center justify-center gap-1">
              <Popover>
                <PopoverTrigger className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground transition-colors">
                  비밀번호를 잊으셨나요?
                  <HelpCircle className="h-3 w-3" />
                </PopoverTrigger>
                <PopoverContent className="w-72 text-xs" side="bottom">
                  <p className="font-medium mb-1">비밀번호 초기화</p>
                  <p className="text-muted-foreground">
                    아래 파일을 삭제하고 {isElectron ? '앱을 종료 후 재시작' : '서버를 재시작'}하면 온보딩 화면에서 새 비밀번호를 설정할 수 있습니다.
                  </p>
                  <code className="mt-2 block rounded bg-muted px-2 py-1 font-mono">~/.purplemux/config.json</code>
                </PopoverContent>
              </Popover>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

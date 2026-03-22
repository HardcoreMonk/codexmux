import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Lock, Terminal } from 'lucide-react';
import { useState } from 'react';

export const LoginForm = ({ className, ...props }: React.ComponentProps<'div'>) => {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
      setError('비밀번호가 올바르지 않습니다.');
      setIsLoading(false);
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <div className="flex flex-col gap-14">
        <div className="flex items-center justify-center gap-2.5">
          <Terminal className="h-6 w-6 text-ui-purple" />
          <span className="animate-shimmer inline-block bg-[length:400%_200%] bg-clip-text text-xl font-semibold text-transparent bg-[linear-gradient(90deg,var(--color-ui-purple)_calc(50%-4em),var(--color-foreground)_50%,var(--color-ui-purple)_calc(50%+4em))] bg-no-repeat">
            Purple Terminal
          </span>
        </div>
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
          <p className="text-center text-muted-foreground text-xs">
            비밀번호는 서버 로그에서 확인할 수 있습니다
          </p>
        </form>
      </div>
    </div>
  );
};

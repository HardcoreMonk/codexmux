import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Lock, Shield, Terminal } from 'lucide-react';
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
      <div className="flex flex-col gap-7">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">로그인</h1>
          <p className="text-muted-foreground text-balance text-sm">비밀번호를 입력하여 접속하세요</p>
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
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <Button type="submit" disabled={isLoading || !password} className="w-full">
            <Lock className="size-4" />
            {isLoading ? '로그인 중...' : '로그인'}
          </Button>
        </form>
        <div className="space-y-2 text-muted-foreground text-xs">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 flex-shrink-0" />
            <span>서버 시작 시 생성된 비밀번호로 접근을 제어합니다</span>
          </div>
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 flex-shrink-0" />
            <span>비밀번호는 서버 로그에서 확인할 수 있습니다</span>
          </div>
        </div>
      </div>
    </div>
  );
};

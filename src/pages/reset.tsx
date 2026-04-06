import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Circle } from 'lucide-react';
import Spinner from '@/components/ui/spinner';

type TStepStatus = 'pending' | 'running' | 'done' | 'error';

interface IStep {
  label: string;
  status: TStepStatus;
}

const StepIcon = ({ status }: { status: TStepStatus }) => {
  switch (status) {
    case 'running':
      return <Spinner className="h-4 w-4 text-purple-400" />;
    case 'done':
      return <Check className="h-4 w-4 text-green-400" />;
    case 'error':
      return <Circle className="h-4 w-4 text-red-400" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/40" />;
  }
};

const SETTLE_DELAY = 800;
const REDIRECT_DELAY = 600;

const ResetPage = () => {
  const t = useTranslations('reset');

  const initialSteps: IStep[] = [
    { label: t('stepCleanup'), status: 'pending' },
    { label: t('stepReset'), status: 'pending' },
    { label: t('stepDone'), status: 'pending' },
  ];

  const [steps, setSteps] = useState<IStep[]>(initialSteps);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const updateStep = (index: number, status: TStepStatus) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, status } : s)));
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // 1단계: 기존 연결 정리 (페이지 이동으로 WS 자연 해제 대기)
      updateStep(0, 'running');
      await new Promise((r) => setTimeout(r, SETTLE_DELAY));
      if (cancelled) return;
      updateStep(0, 'done');

      // 2단계: tmux 초기화 API 호출
      updateStep(1, 'running');
      try {
        const res = await fetch('/api/tmux/reset', { method: 'POST' });
        if (!res.ok) throw new Error(t('apiError'));
      } catch {
        if (cancelled) return;
        updateStep(1, 'error');
        setErrorMsg(t('resetFailed'));
        return;
      }
      if (cancelled) return;
      updateStep(1, 'done');

      // 3단계: 완료 → 리다이렉트
      updateStep(2, 'done');
      await new Promise((r) => setTimeout(r, REDIRECT_DELAY));
      if (cancelled) return;
      window.location.href = '/';
    };

    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <Head>
        <title>{t('pageTitle')}</title>
      </Head>
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-xs space-y-6">
          <h1 className="text-lg font-semibold text-center">{t('title')}</h1>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <StepIcon status={step.status} />
                <span className={`text-sm ${step.status === 'pending' ? 'text-muted-foreground/40' : 'text-foreground'}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
          {errorMsg && (
            <p className="text-sm text-red-400 text-center">{errorMsg}</p>
          )}
        </div>
      </div>
    </>
  );
};

export default ResetPage;

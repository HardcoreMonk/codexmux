import { useTranslations } from 'next-intl';
import type { GetServerSideProps } from 'next';
import { LoginForm } from '@/components/features/login/login-form';
import OnboardingWizard from '@/components/features/login/onboarding-wizard';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { loadMessagesServer } from '@/lib/load-messages';

type TMode = 'loading' | 'onboarding' | 'login';

const LoginPage = () => {
  const t = useTranslations('login');
  const [mode, setMode] = useState<TMode>('loading');

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await fetch('/api/auth/setup');
        const { needsSetup } = await res.json();
        setMode(needsSetup ? 'onboarding' : 'login');
      } catch {
        setMode('login');
      }
    };
    checkSetup();
  }, []);

  return (
    <>
      <Head>
        <title>{mode === 'onboarding' ? t('setupTitle') : t('pageTitle')}</title>
      </Head>
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className={mode === 'onboarding' ? 'w-full max-w-sm' : 'w-full max-w-xs'}>
          {mode === 'loading' && (
            <div className="flex justify-center py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            </div>
          )}
          {mode === 'onboarding' && <OnboardingWizard onComplete={() => setMode('login')} />}
          {mode === 'login' && <LoginForm />}
        </div>
      </div>
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async () => {
  const messages = await loadMessagesServer();
  return { props: { messages } };
};

export default LoginPage;

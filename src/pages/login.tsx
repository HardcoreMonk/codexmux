import { useTranslations } from 'next-intl';
import type { GetServerSideProps } from 'next';
import { LoginForm } from '@/components/features/login/login-form';
import OnboardingWizard from '@/components/features/login/onboarding-wizard';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { loadMessagesServerBundle } from '@/lib/load-messages';

type TMode = 'loading' | 'onboarding' | 'login' | 'initLogin';

const LoginPage = () => {
  const t = useTranslations('login');
  const [mode, setMode] = useState<TMode>('loading');
  const [hostEnvLocked, setHostEnvLocked] = useState(false);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await fetch('/api/auth/setup');
        const { needsSetup, requiresAuth, hostEnvLocked } = await res.json();
        setHostEnvLocked(!!hostEnvLocked);
        if (needsSetup) {
          setMode(requiresAuth ? 'initLogin' : 'onboarding');
        } else {
          setMode('login');
        }
      } catch {
        setMode('login');
      }
    };
    checkSetup();
  }, []);

  const isOnboarding = mode === 'onboarding' || mode === 'initLogin';
  const panelClassName = isOnboarding
    ? 'w-full max-w-md rounded-xl border border-border/70 bg-card/80 px-5 py-6 ring-1 ring-foreground/5 sm:px-6'
    : 'w-full max-w-sm rounded-xl border border-border/70 bg-card/80 px-5 py-6 ring-1 ring-foreground/5 sm:px-6';

  return (
    <>
      <Head>
        <title>{isOnboarding ? t('setupTitle') : t('pageTitle')}</title>
      </Head>
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8 sm:p-6">
        <div className={panelClassName}>
          {mode === 'loading' && (
            <div className="flex justify-center py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            </div>
          )}
          {mode === 'initLogin' && <LoginForm onSuccess={() => setMode('onboarding')} />}
          {mode === 'onboarding' && <OnboardingWizard onComplete={() => setMode('login')} hostEnvLocked={hostEnvLocked} />}
          {mode === 'login' && <LoginForm />}
        </div>
      </div>
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { locale, messages } = await loadMessagesServerBundle();
  const isElectron = /Electron/i.test(context.req.headers['user-agent'] ?? '');
  return { props: { messages, messagesLocale: locale, isElectron } };
};

export default LoginPage;

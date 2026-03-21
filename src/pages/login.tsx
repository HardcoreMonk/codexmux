import { LoginForm } from '@/components/features/login/login-form';
import Head from 'next/head';
import { useEffect } from 'react';

const LoginPage = () => {
  useEffect(() => {
    document.body.classList.add('dark');
    return () => {
      document.body.classList.remove('dark');
    };
  }, []);

  return (
    <>
      <Head>
        <title>로그인 - Purple Terminal</title>
      </Head>
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-xs">
          <LoginForm />
        </div>
      </div>
    </>
  );
};

export default LoginPage;

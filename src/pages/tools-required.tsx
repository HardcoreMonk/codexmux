import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { AlertTriangle, Check, Download, Loader2, RefreshCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AppLogo from '@/components/layout/app-logo';
import InstallDialog from '@/components/features/login/install-dialog';
import { useRuntimePreflight } from '@/hooks/use-runtime-preflight';
import { isRuntimeOk, readRuntimeAgentStatus } from '@/types/preflight';
import type { IRuntimePreflightResult } from '@/types/preflight';

const getNextInstall = (
  status: IRuntimePreflightResult,
  t: (key: string) => string,
): { command: string; label: string } | null => {
  if (!(status.tmux.installed && status.tmux.compatible)) {
    const needsUpgrade = status.tmux.installed && !status.tmux.compatible;
    return {
      command: needsUpgrade ? 'tmux-upgrade' : 'tmux-install',
      label: needsUpgrade ? t('upgradeTmux') : t('installTmux'),
    };
  }
  if (!status.git.installed) {
    return { command: 'git', label: t('installGit') };
  }
  const agent = readRuntimeAgentStatus(status);
  if (!agent.installed) {
    return { command: 'codex', label: t('installCodex') };
  }
  return null;
};


const ToolsRequiredPage = () => {
  const t = useTranslations('toolsRequired');
  const router = useRouter();
  const from = (router.query.from as string) || '/';
  const { status, checking, recheck } = useRuntimePreflight();
  const [installTarget, setInstallTarget] = useState<{ command: string; label: string } | null>(null);

  useEffect(() => {
    if (status && isRuntimeOk(status)) {
      window.location.href = from;
    }
  }, [status, from]);

  const tools = status
    ? [
        { name: 'tmux', ok: status.tmux.installed && status.tmux.compatible, version: status.tmux.version },
        { name: 'Git', ok: status.git.installed, version: status.git.version },
        {
          name: 'Codex CLI',
          ok: readRuntimeAgentStatus(status).installed,
          version: readRuntimeAgentStatus(status).version,
        },
      ]
    : [];

  const nextInstall = status ? getNextInstall(status, t) : null;

  return (
    <>
      <Head>
        <title>{t('pageTitle')}</title>
      </Head>
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-sm flex flex-col gap-6">
          <AppLogo shimmer size="xl" className="justify-center" />

          {checking && !status ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">{t('checking')}</span>
            </div>
          ) : status && isRuntimeOk(status) ? (
            <div className="flex items-center justify-center gap-2 py-8 text-positive">
              <Check className="h-5 w-5" />
              <span className="text-sm font-medium">{t('allGood')}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-ui-amber">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">{t('title')}</p>
              </div>
              <p className="text-sm text-muted-foreground">{t('description')}</p>
              <div className="space-y-1.5">
                {tools.map((tool) => (
                  <div key={tool.name} className="flex items-center gap-2 text-sm">
                    {tool.ok ? (
                      <Check className="h-4 w-4 shrink-0 text-positive" />
                    ) : (
                      <X className="h-4 w-4 shrink-0 text-negative" />
                    )}
                    <span className={tool.ok ? 'text-muted-foreground' : 'text-foreground font-medium'}>
                      {tool.name}
                    </span>
                    {tool.version && (
                      <span className="text-xs text-muted-foreground">({tool.version})</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                {nextInstall && (
                  <Button
                    size="lg"
                    className="h-12 w-full"
                    onClick={() => setInstallTarget(nextInstall)}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    {nextInstall.label}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 w-full"
                  disabled={checking}
                  onClick={recheck}
                >
                  <RefreshCcw className="mr-1 h-4 w-4" />
                  {t('recheck')}
                </Button>
              </div>
            </div>
          )}

          {installTarget && (
            <InstallDialog
              open
              onOpenChange={() => setInstallTarget(null)}
              command={installTarget.command}
              label={installTarget.label}
            />
          )}
        </div>
      </div>
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { requireAuth } = await import('@/lib/require-auth');
  const { loadMessagesServer } = await import('@/lib/load-messages');
  return requireAuth(context, async () => {
    const messages = await loadMessagesServer();
    return { props: { messages } };
  }, { skipPreflight: true });
};

export default ToolsRequiredPage;

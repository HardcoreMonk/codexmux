import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PlugZap, Plus, RefreshCw, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPageShellLayout } from '@/components/layout/page-shell';
import { decodeMessage, encodeStdin, MSG_STDOUT, textDecoder } from '@/lib/terminal-protocol';

interface IRuntimeWorkspace {
  id: string;
  name?: string;
  rootPaneId?: string;
  defaultCwd?: string;
}

interface IRuntimeTab {
  id: string;
  sessionName: string;
}

type TRuntimeApiStatus = 'statusIdle' | 'creatingWorkspace' | 'workspaceCreated' | 'creatingTab' | 'tabCreated';
type TTerminalStatus = 'terminalClosed' | 'terminalConnecting' | 'terminalConnected';

const toWebSocketUrl = (path: string): string => {
  const url = new URL(path, window.location.href);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};

const RuntimeExperimentalPage = () => {
  const t = useTranslations('runtime');
  const [workspaces, setWorkspaces] = useState<IRuntimeWorkspace[]>([]);
  const [workspace, setWorkspace] = useState<IRuntimeWorkspace | null>(null);
  const [tab, setTab] = useState<IRuntimeTab | null>(null);
  const [layout, setLayout] = useState<unknown>(null);
  const [status, setStatus] = useState<TRuntimeApiStatus>('statusIdle');
  const [terminalStatus, setTerminalStatus] = useState<TTerminalStatus>('terminalClosed');
  const [terminalOutput, setTerminalOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const requestJson = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(url, init);
    const data = await res.json();
    if (!res.ok) {
      const message = typeof data?.message === 'string'
        ? data.message
        : typeof data?.error === 'string'
          ? data.error
          : t('error');
      throw new Error(message);
    }
    return data as T;
  }, [t]);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await requestJson<{ workspaces: IRuntimeWorkspace[] }>('/api/v2/workspaces');
      setWorkspaces(data.workspaces);
      setWorkspace((current) => current ?? data.workspaces[0] ?? null);
    } catch (err) {
      setError(err instanceof Error && err.message === 'runtime-v2-disabled' ? t('runtimeUnavailable') : err instanceof Error ? err.message : t('error'));
    }
  }, [requestJson, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const attachTerminal = useCallback((sessionName: string) => {
    socketRef.current?.close();
    setTerminalOutput('');
    setTerminalStatus('terminalConnecting');
    const ws = new WebSocket(toWebSocketUrl(`/api/v2/terminal?session=${encodeURIComponent(sessionName)}&cols=80&rows=24`));
    ws.binaryType = 'arraybuffer';
    socketRef.current = ws;
    ws.onopen = () => {
      setTerminalStatus('terminalConnected');
      ws.send(encodeStdin('pwd\n'));
    };
    ws.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      const msg = decodeMessage(event.data);
      if (msg.type !== MSG_STDOUT) return;
      setTerminalOutput((prev) => `${prev}${textDecoder.decode(msg.payload)}`);
    };
    ws.onerror = () => {
      setTerminalStatus('terminalClosed');
    };
    ws.onclose = () => {
      setTerminalStatus('terminalClosed');
    };
  }, []);

  const createWorkspace = useCallback(async () => {
    try {
      setError(null);
      setStatus('creatingWorkspace');
      const created = await requestJson<IRuntimeWorkspace>('/api/v2/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: t('defaultWorkspaceName') }),
      });
      setWorkspace(created);
      setWorkspaces((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setStatus('workspaceCreated');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
      setStatus('statusIdle');
    }
  }, [requestJson, t]);

  const createTab = useCallback(async () => {
    if (!workspace?.rootPaneId) {
      setError(t('selectWorkspaceFirst'));
      return;
    }
    try {
      setError(null);
      setStatus('creatingTab');
      const created = await requestJson<IRuntimeTab>('/api/v2/tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.id, paneId: workspace.rootPaneId }),
      });
      setTab(created);
      const nextLayout = await requestJson<unknown>(`/api/v2/workspaces/${workspace.id}/layout`);
      setLayout(nextLayout);
      setStatus('tabCreated');
      attachTerminal(created.sessionName);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
      setStatus('statusIdle');
    }
  }, [attachTerminal, requestJson, t, workspace]);

  const selectedDetails = {
    workspace,
    tab,
    layout,
    workspaces,
  };

  return (
    <>
      <Head>
        <title>{t('title')}</title>
      </Head>
      <main className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <header>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </header>

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button className="min-h-11 sm:min-h-9" variant="outline" type="button" onClick={refresh}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            {t('refresh')}
          </Button>
          <Button className="min-h-11 sm:min-h-9" variant="outline" type="button" onClick={createWorkspace}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('createWorkspace')}
          </Button>
          <Button className="min-h-11 sm:min-h-9" variant="outline" type="button" onClick={createTab} disabled={!workspace?.rootPaneId}>
            <Terminal className="mr-1.5 h-4 w-4" />
            {t('createTerminalTab')}
          </Button>
          <Button className="min-h-11 sm:min-h-9" variant="outline" type="button" onClick={() => tab && attachTerminal(tab.sessionName)} disabled={!tab}>
            <PlugZap className="mr-1.5 h-4 w-4" />
            {t('attach')}
          </Button>
        </div>

        <section className="rounded border p-3 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>{t('apiStatus')}: {t(status)}</span>
            <span>{t('terminalStatus')}: {t(terminalStatus)}</span>
            {workspace && <span>{t('selectedWorkspace')}: {workspace.id}</span>}
            {tab && <span>{t('sessionName')}: {tab.sessionName}</span>}
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{t('error')}: {error}</p>}
          {!workspace && !error && <p className="mt-2 text-sm text-muted-foreground">{t('noWorkspaces')}</p>}
        </section>

        <section className="rounded border p-3">
          <h2 className="mb-2 text-sm font-medium">{t('terminalStatus')}</h2>
          <pre className="min-h-36 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-xs">
            {terminalOutput || t('terminalOutputEmpty')}
          </pre>
        </section>

        <section className="rounded border p-3">
          <h2 className="mb-2 text-sm font-medium">{t('diagnosticDetails')}</h2>
          <pre className="max-h-80 overflow-auto text-xs">{JSON.stringify(selectedDetails, null, 2)}</pre>
        </section>
      </main>
    </>
  );
};

RuntimeExperimentalPage.getLayout = getPageShellLayout;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { requireAuth } = await import('@/lib/require-auth');
  const { loadMessagesServerBundle } = await import('@/lib/load-messages');
  return requireAuth(context, async () => {
    const { locale, messages } = await loadMessagesServerBundle();
    return { props: { messages, messagesLocale: locale } };
  }, { skipPreflight: true });
};

export default RuntimeExperimentalPage;

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Check, Copy, ExternalLink, Info, Plus, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface IServeEntry {
  httpsPort: string;
  proxy: string;
}

interface ITailscaleStatus {
  installed: boolean;
  running: boolean;
  version: string | null;
  hostname: string | null;
  dnsName: string | null;
  tailscaleIp: string | null;
  serveEntries: IServeEntry[];
}

const DEFAULT_PORT = 8022;

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleCopy}>
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
};

const NotInstalledGuide = () => (
  <div className="space-y-4">
    <div className="flex items-start gap-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
      <div className="space-y-1">
        <p className="text-sm font-medium">Tailscale CLI가 설치되어 있지 않습니다</p>
        <p className="text-sm text-muted-foreground">
          Tailscale을 설치하면 외부에서 안전하게 접속할 수 있습니다.
        </p>
      </div>
    </div>
    <div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
      <p className="text-muted-foreground/60"># macOS</p>
      <p>brew install tailscale</p>
      <p className="mt-2 text-muted-foreground/60"># 또는 Mac App Store에서 설치</p>
      <p className="mt-2 text-muted-foreground/60"># Linux (Ubuntu/Debian)</p>
      <p>curl -fsSL https://tailscale.com/install.sh | sh</p>
      <p className="mt-2 text-muted-foreground/60"># 설치 후 로그인</p>
      <p>tailscale up</p>
    </div>
    <p className="text-sm text-muted-foreground">
      자세한 설치 방법은{' '}
      <a
        href="https://tailscale.com/download"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 underline hover:text-foreground"
      >
        Tailscale 공식 사이트
        <ExternalLink className="h-3 w-3" />
      </a>
      를 참고하세요.
    </p>
  </div>
);

const TailscaleSettings = () => {
  const [status, setStatus] = useState<ITailscaleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [customHttpsPort, setCustomHttpsPort] = useState('');
  const [customLocalPort, setCustomLocalPort] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/tailscale/status');
      if (!res.ok) throw new Error();
      const data: ITailscaleStatus = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleAdd = async (httpsPort: string, localPort: string) => {
    setActionLoading(`add-${httpsPort}`);
    try {
      const res = await fetch('/api/tailscale/serve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ httpsPort, localPort }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '추가 실패');
      }
      toast.success(`HTTPS :${httpsPort} → localhost:${localPort} 추가됨`);
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '추가 실패');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (httpsPort: string) => {
    setActionLoading(`remove-${httpsPort}`);
    try {
      const res = await fetch('/api/tailscale/serve', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ httpsPort }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '제거 실패');
      }
      toast.success(`HTTPS :${httpsPort} 제거됨`);
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '제거 실패');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCustomAdd = () => {
    const hp = customHttpsPort.trim();
    const lp = customLocalPort.trim();
    if (!hp || !lp) {
      toast.error('포트를 입력하세요');
      return;
    }
    handleAdd(hp, lp);
    setCustomHttpsPort('');
    setCustomLocalPort('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  if (!status || !status.installed) {
    return <NotInstalledGuide />;
  }

  if (!status.running) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Tailscale이 실행 중이 아닙니다</p>
            <p className="text-sm text-muted-foreground">Tailscale을 시작해 주세요.</p>
          </div>
        </div>
        <div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
          <p>tailscale up</p>
        </div>
      </div>
    );
  }

  const activeEntries = status.serveEntries;
  const currentPort = typeof window !== 'undefined'
    ? parseInt(window.location.port || '443', 10)
    : DEFAULT_PORT;
  const isNonDefaultPort = currentPort !== DEFAULT_PORT;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">디바이스 정보</p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setLoading(true); fetchStatus(); }}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5">
            <span className="text-muted-foreground">호스트</span>
            <span className="font-mono text-xs">{status.hostname}</span>
            <span className="text-muted-foreground">DNS</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs">{status.dnsName}</span>
              {status.dnsName && <CopyButton text={status.dnsName} />}
            </div>
            <span className="text-muted-foreground">IP</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs">{status.tailscaleIp}</span>
              {status.tailscaleIp && <CopyButton text={status.tailscaleIp} />}
            </div>
            <span className="text-muted-foreground">버전</span>
            <span className="font-mono text-xs">{status.version}</span>
          </div>
        </div>
      </div>

      {isNonDefaultPort && (
        <div className="flex items-start gap-3 rounded-md border border-blue-500/30 bg-blue-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
          <div className="space-y-2">
            <p className="text-sm font-medium">
              현재 서버가 포트 {currentPort}에서 실행 중입니다
            </p>
            <p className="text-sm text-muted-foreground">
              기본 포트({DEFAULT_PORT})가 사용 중이어서 자동으로 다른 포트가 할당되었습니다.
              자동 할당된 포트는 서버 재시작 시 변경될 수 있으므로, Tailscale Serve 설정 시 로컬 포트를{' '}
              <span className="font-mono font-medium text-foreground">{currentPort}</span> 대신{' '}
              <span className="font-mono font-medium text-foreground">{DEFAULT_PORT}</span>로 설정하는 것을 권장합니다.
            </p>
            <div className="rounded-md bg-muted p-2.5 font-mono text-xs leading-relaxed">
              <p className="text-muted-foreground/60"># 고정 포트({DEFAULT_PORT})를 사용하려면</p>
              <p>PORT={DEFAULT_PORT} purplemux</p>
              <p className="mt-1.5 text-muted-foreground/60"># 또는 기존 {DEFAULT_PORT} 포트를 점유한 프로세스를 종료 후 재시작</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium">Serve 상태</p>
        {activeEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">활성화된 serve 항목이 없습니다.</p>
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">HTTPS 포트</th>
                  <th className="px-3 py-2 text-left font-medium">프록시 대상</th>
                  <th className="px-3 py-2 text-left font-medium">URL</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {activeEntries.map((entry) => {
                  const url = entry.httpsPort === '443'
                    ? `https://${status.dnsName}`
                    : `https://${status.dnsName}:${entry.httpsPort}`;
                  return (
                    <tr key={entry.httpsPort} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-mono text-xs">{entry.httpsPort}</td>
                      <td className="px-3 py-2 font-mono text-xs">{entry.proxy}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs underline hover:text-foreground"
                          >
                            {url}
                          </a>
                          <CopyButton text={url} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          disabled={actionLoading !== null}
                          onClick={() => handleRemove(entry.httpsPort)}
                        >
                          {actionLoading === `remove-${entry.httpsPort}` ? (
                            <Spinner className="h-3 w-3" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Serve 추가</p>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="ts-https-port" className="text-xs text-muted-foreground">
              HTTPS 포트
            </Label>
            <Input
              id="ts-https-port"
              placeholder="443"
              value={customHttpsPort}
              onChange={(e) => setCustomHttpsPort(e.target.value)}
              className="w-24"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ts-local-port" className="text-xs text-muted-foreground">
              로컬 포트
            </Label>
            <Input
              id="ts-local-port"
              placeholder="8022"
              value={customLocalPort}
              onChange={(e) => setCustomLocalPort(e.target.value)}
              className="w-24"
            />
          </div>
          <Button
            variant="outline"
            size="default"
            disabled={actionLoading !== null || !customHttpsPort.trim() || !customLocalPort.trim()}
            onClick={handleCustomAdd}
          >
            {actionLoading?.startsWith('add-') ? (
              <Spinner className="mr-1.5 h-3 w-3" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            추가
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TailscaleSettings;

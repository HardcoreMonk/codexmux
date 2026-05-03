import type { IRemoteTerminalStatus } from '@/types/remote-terminal';
import type { IRemoteCodexSourceStatus } from '@/types/timeline';

export interface IWindowsTerminalLinkTarget {
  sourceId: string;
  terminalId: string | null;
  href: string;
}

interface IGetWindowsTerminalLinkTargetInput {
  remoteSources: IRemoteCodexSourceStatus[];
  remoteTerminals: IRemoteTerminalStatus[];
}

const buildHref = (sourceId: string, terminalId: string | null): string => {
  const params = new URLSearchParams({ sourceId });
  if (terminalId) params.set('terminalId', terminalId);
  return `/windows-terminal?${params.toString()}`;
};

export const getWindowsTerminalLinkTarget = ({
  remoteSources,
  remoteTerminals,
}: IGetWindowsTerminalLinkTargetInput): IWindowsTerminalLinkTarget | null => {
  const terminal = remoteTerminals[0];
  if (terminal) {
    return {
      sourceId: terminal.sourceId,
      terminalId: terminal.terminalId,
      href: buildHref(terminal.sourceId, terminal.terminalId),
    };
  }

  const source = remoteSources[0];
  if (!source) return null;
  return {
    sourceId: source.sourceId,
    terminalId: null,
    href: buildHref(source.sourceId, null),
  };
};

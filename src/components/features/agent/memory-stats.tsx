import { memo } from 'react';

interface IMemoryStatsProps {
  totalFiles: number;
  totalSizeBytes: number;
  agentFiles: number;
  agentSizeBytes: number;
  agentName: string;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const MemoryStats = ({
  totalFiles,
  totalSizeBytes,
  agentFiles,
  agentSizeBytes,
  agentName,
}: IMemoryStatsProps) => (
  <div className="flex gap-6 border-t px-4 py-2 text-xs text-muted-foreground">
    <span>
      전체: {totalFiles} 파일, {formatBytes(totalSizeBytes)}
    </span>
    <span>
      {agentName}: {agentFiles} 파일, {formatBytes(agentSizeBytes)}
    </span>
  </div>
);

export default memo(MemoryStats);

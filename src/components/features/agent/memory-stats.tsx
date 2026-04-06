import { memo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';
import dayjs from 'dayjs';
import type { IRecentMemoryFile } from '@/types/memory';

interface IMemoryStatsProps {
  totalFiles: number;
  totalSizeBytes: number;
  agentFiles: number;
  agentSizeBytes: number;
  agentName: string;
  recentFiles: IRecentMemoryFile[];
  onFileSelect: (path: string) => void;
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
  recentFiles,
  onFileSelect,
}: IMemoryStatsProps) => {
  const t = useTranslations('agent');
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-t">
      {isExpanded && recentFiles.length > 0 && (
        <div className="border-b px-4 py-2">
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Clock size={10} />
            {t('recentChanges')}
          </div>
          {recentFiles.map((file) => (
            <button
              key={file.path}
              type="button"
              className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/50"
              onClick={() => onFileSelect(file.path)}
            >
              <span className="truncate text-foreground">{file.fileName}</span>
              <span className="shrink-0 text-muted-foreground">
                {dayjs(file.modifiedAt).format('MM-DD HH:mm')}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-6 px-4 py-2 text-xs text-muted-foreground">
        <span>
          {t('totalStats', { files: totalFiles, size: formatBytes(totalSizeBytes) })}
        </span>
        <span>
          {t('agentStats', { name: agentName, files: agentFiles, size: formatBytes(agentSizeBytes) })}
        </span>
        {recentFiles.length > 0 && (
          <button
            type="button"
            className="ml-auto flex items-center gap-0.5 hover:text-foreground"
            onClick={() => setIsExpanded((prev) => !prev)}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            {t('recentChanges')}
          </button>
        )}
      </div>
    </div>
  );
};

export default memo(MemoryStats);

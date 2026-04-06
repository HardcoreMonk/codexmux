import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import dayjs from 'dayjs';
import type { IActivityEntry } from '@/types/agent';

interface IRecentActivityProps {
  entries: IActivityEntry[];
}

const RecentActivity = ({ entries }: IRecentActivityProps) => {
  const t = useTranslations('agent');
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const sorted = useMemo(
    () => [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [entries],
  );

  if (sorted.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={toggle}
      >
        <ChevronRight
          size={14}
          className={open ? 'rotate-90 transition-transform' : 'transition-transform'}
        />
        {t('recentActivity', { count: sorted.length })}
      </button>

      {open && (
        <div className="mt-2" role="log">
          {sorted.map((entry, i) => (
            <div key={`${entry.timestamp}-${i}`} className="flex items-baseline gap-2 py-1.5">
              <span className="w-12 text-xs tabular-nums text-muted-foreground">
                {dayjs(entry.timestamp).format('HH:mm')}
              </span>
              <span className="flex-1 text-xs">{entry.action}</span>
              {entry.projectName && (
                <span className="ml-auto text-xs text-muted-foreground">{entry.projectName}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecentActivity;

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { TPeriod } from '@/types/stats';

interface IPeriodFilterProps {
  value: TPeriod;
  onChange: (period: TPeriod) => void;
}

const PERIOD_VALUES: TPeriod[] = ['today', '7d', '30d', 'all'];

const PERIOD_KEYS: Record<TPeriod, string> = {
  today: 'periodToday',
  '7d': 'period7d',
  '30d': 'period30d',
  all: 'periodAll',
};

const PeriodFilter = ({ value, onChange }: IPeriodFilterProps) => {
  const t = useTranslations('stats');

  return (
    <div className="flex gap-1">
      {PERIOD_VALUES.map((p) => (
        <Button
          key={p}
          variant={value === p ? 'default' : 'ghost'}
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => onChange(p)}
        >
          {t(PERIOD_KEYS[p])}
        </Button>
      ))}
    </div>
  );
};

export default PeriodFilter;

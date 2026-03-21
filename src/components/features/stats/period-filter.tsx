import { Button } from '@/components/ui/button';
import type { TPeriod } from '@/types/stats';

interface IPeriodFilterProps {
  value: TPeriod;
  onChange: (period: TPeriod) => void;
}

const PERIODS: { value: TPeriod; label: string }[] = [
  { value: 'today', label: '오늘' },
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
  { value: 'all', label: '전체' },
];

const PeriodFilter = ({ value, onChange }: IPeriodFilterProps) => {
  return (
    <div className="flex gap-1">
      {PERIODS.map((p) => (
        <Button
          key={p.value}
          variant={value === p.value ? 'default' : 'ghost'}
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => onChange(p.value)}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
};

export default PeriodFilter;

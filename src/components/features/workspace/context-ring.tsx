import { useTranslations } from 'next-intl';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatTokenCount } from '@/lib/model-tokens';

interface IContextRingProps {
  percentage: number;
  currentTokens: number | null;
  windowSize: number | null;
}

const getTier = (p: number): 'ok' | 'warn' | 'danger' | 'critical' => {
  if (p >= 92) return 'critical';
  if (p >= 80) return 'danger';
  if (p >= 50) return 'warn';
  return 'ok';
};

const TIER_COLOR: Record<ReturnType<typeof getTier>, string> = {
  ok: 'text-muted-foreground',
  warn: 'text-ui-amber',
  danger: 'text-ui-red',
  critical: 'text-ui-red',
};

const RADIUS = 4.5;
const STROKE = 1.75;
const SIZE = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ContextRing = ({ percentage, currentTokens, windowSize }: IContextRingProps) => {
  const t = useTranslations('session.meta');
  const clamped = Math.max(0, Math.min(100, percentage));
  const tier = getTier(clamped);
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  const color = TIER_COLOR[tier];

  const detail =
    currentTokens !== null && windowSize !== null
      ? `${formatTokenCount(currentTokens)} / ${formatTokenCount(windowSize)} (${Math.round(clamped)}%)`
      : `${Math.round(clamped)}%`;

  const hint =
    tier === 'critical' || tier === 'danger'
      ? t('contextHintRed')
      : tier === 'warn'
        ? t('contextHintAmber')
        : null;

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          'inline-flex shrink-0 items-center gap-1 font-mono',
          color,
          tier === 'critical' && 'animate-pulse',
        )}
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="shrink-0 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span>{Math.round(clamped)}%</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="font-mono">{detail}</span>
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export default ContextRing;

import { CircleHelp, CornerDownRight, GitFork, RotateCcw, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import {
  selectSessionRelationshipDisplay,
  type ISessionRelationshipDisplay,
} from '@/lib/session-relationship-display';
import type { IAgentSessionRelationship } from '@/lib/agent-session-relationship';

interface ISessionRelationshipIndicatorProps {
  relationship?: IAgentSessionRelationship | null;
  className?: string;
  showTarget?: boolean;
}

const iconByLabelKey: Record<ISessionRelationshipDisplay['labelKey'], LucideIcon> = {
  fork: GitFork,
  subAgent: CornerDownRight,
  resume: RotateCcw,
  unknown: CircleHelp,
};

const toneClasses: Record<ISessionRelationshipDisplay['tone'], string> = {
  agent: 'border-agent-active/20 bg-agent-active/10 text-agent-active',
  blue: 'border-ui-blue/20 bg-ui-blue/10 text-ui-blue',
  green: 'border-ui-green/20 bg-ui-green/10 text-ui-green',
  muted: 'border-border bg-muted/60 text-muted-foreground',
};

export const SessionRelationshipBadge = ({
  relationship,
  className,
  showTarget = false,
}: ISessionRelationshipIndicatorProps) => {
  const t = useTranslations('session.relationship');
  const display = selectSessionRelationshipDisplay(relationship);
  if (!display) return null;

  const Icon = iconByLabelKey[display.labelKey];
  const label = t(display.labelKey);
  const targetKind = t(display.targetKind);
  const title = t('badgeTitle', {
    type: label,
    kind: targetKind,
    id: display.targetShortId,
  });

  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full shrink-0 items-center gap-1 rounded border px-1.5 text-[11px] leading-none',
        toneClasses[display.tone],
        className,
      )}
      title={title}
      data-relationship-type={display.relationshipType}
    >
      <Icon size={11} className="shrink-0" />
      <span className="truncate">{label}</span>
      {showTarget && (
        <span className="max-w-[96px] truncate font-mono text-[10px] opacity-80">
          {display.targetShortId}
        </span>
      )}
    </span>
  );
};

export const SessionRelationshipDetailRow = ({
  relationship,
  className,
}: ISessionRelationshipIndicatorProps) => {
  const t = useTranslations('session.relationship');
  const display = selectSessionRelationshipDisplay(relationship);
  if (!display) return null;

  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className="w-14 shrink-0 text-xs text-muted-foreground/70">{t('label')}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <SessionRelationshipBadge relationship={relationship} showTarget />
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {t('target', {
            kind: t(display.targetKind),
            id: display.targetShortId,
          })}
        </span>
        {display.confidence !== 'high' && (
          <span className="text-xs text-muted-foreground/60">
            {t('confidence', { confidence: t(`confidenceValue.${display.confidence}`) })}
          </span>
        )}
      </div>
    </div>
  );
};

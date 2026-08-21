import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { AlertTriangle, History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { IGovernanceActionSummary } from '@/lib/governance/scaffold-contracts';

interface IGovernanceActionHistoryProps {
  actions: IGovernanceActionSummary[];
  busy: boolean;
  onPreviewRollback: (actionId: string) => void | Promise<void>;
}

const GovernanceActionHistory = ({ actions, busy, onPreviewRollback }: IGovernanceActionHistoryProps) => {
  const t = useTranslations('governance');
  const recoveryRequired = actions.some((action) => action.state === 'recovery-required');
  return (
    <section className="rounded-md border xl:col-span-2">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold">
        <History className="h-3.5 w-3.5" />
        {t('scaffold.history')}
      </div>
      {recoveryRequired && (
        <div className="flex gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-3 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span>{t('scaffold.recoveryRequired')}</span>
        </div>
      )}
      {actions.length === 0 && <div className="p-3 text-xs text-muted-foreground">{t('scaffold.noActions')}</div>}
      <div className="divide-y">
        {actions.map((action) => {
          const rollbackable = ['committed', 'index-stale', 'rollback-stale'].includes(action.state);
          return (
            <div key={action.id} className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs">
              <div className="min-w-0">
                <div className="truncate font-mono font-medium">{action.id}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {dayjs(action.updatedAt).format('YYYY-MM-DD HH:mm')} · {t('scaffold.artifactCount', { count: action.artifactCount })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-2 py-1 text-[10px]">{t(`scaffold.actionState.${action.state}`)}</span>
                {rollbackable && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => void onPreviewRollback(action.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t('scaffold.rollback')}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default GovernanceActionHistory;

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type {
  IGovernanceRollbackPreview,
  IScaffoldPreview,
} from '@/lib/governance/scaffold-contracts';

interface IGovernanceScaffoldPreviewDrawerProps {
  preview: IScaffoldPreview | IGovernanceRollbackPreview | null;
  mode: 'scaffold' | 'rollback';
  busy: boolean;
  onConfirm: (confirmation: string) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}

const isScaffoldPreview = (
  preview: IScaffoldPreview | IGovernanceRollbackPreview,
): preview is IScaffoldPreview => 'totalBytes' in preview;

const GovernanceScaffoldPreviewDrawer = ({
  preview,
  mode,
  busy,
  onConfirm,
  onOpenChange,
}: IGovernanceScaffoldPreviewDrawerProps) => {
  const t = useTranslations('governance');
  const [confirmationState, setConfirmationState] = useState({ token: '', value: '' });
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (!preview) return;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [preview]);

  const confirmation = confirmationState.token === preview?.token ? confirmationState.value : '';
  const remainingSeconds = preview
    ? Math.max(0, Math.ceil((preview.expiresAt - currentTime) / 1_000))
    : 0;

  const hasConflict = Boolean(preview && preview.artifacts.some((artifact) => artifact.state === 'conflict'));
  const hasScaffoldChange = Boolean(preview && (!isScaffoldPreview(preview)
    || preview.artifacts.some((artifact) => artifact.state === 'create' || artifact.state === 'marker-update')));
  const valid = Boolean(
    preview && remainingSeconds > 0 && confirmation === preview.projectTitle && !hasConflict && hasScaffoldChange,
  );

  return (
    <Sheet open={preview !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-4xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{mode === 'scaffold' ? t('scaffold.previewTitle') : t('scaffold.rollbackPreviewTitle')}</SheetTitle>
          <SheetDescription>
            {preview ? `${preview.projectTitle} · ${t('scaffold.expiresIn', { seconds: remainingSeconds })}` : ''}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {preview && isScaffoldPreview(preview) && (
            <div className="space-y-3">
              {preview.artifacts.filter((artifact) => artifact.state !== 'skipped').map((artifact) => (
                <section key={artifact.id} className="overflow-hidden rounded-md border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2 text-xs">
                    <span className="font-mono font-medium">{artifact.path}</span>
                    <span>{t(`scaffold.artifactState.${artifact.state}`)} · v{artifact.toVersion}</span>
                  </div>
                  {artifact.diff && (
                    <pre className="max-h-80 overflow-auto whitespace-pre font-mono text-[11px] leading-5 p-3">{artifact.diff}</pre>
                  )}
                  {artifact.errorCode && <div className="p-3 text-xs text-destructive">{artifact.errorCode}</div>}
                </section>
              ))}
            </div>
          )}
          {preview && !isScaffoldPreview(preview) && (
            <div className="divide-y rounded-md border">
              {preview.artifacts.map((artifact) => (
                <div key={artifact.id} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="font-mono">{artifact.path}</span>
                  <span className={artifact.state === 'conflict' ? 'text-destructive' : 'text-muted-foreground'}>
                    {t(`scaffold.rollbackState.${artifact.state}`)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <SheetFooter className="border-t">
          <label className="text-xs font-medium" htmlFor={`${mode}-project-confirmation`}>
            {t('scaffold.confirmProject', { title: preview?.projectTitle ?? '' })}
          </label>
          <Input
            id={`${mode}-project-confirmation`}
            value={confirmation}
            onChange={(event) => setConfirmationState({
              token: preview?.token ?? '',
              value: event.target.value,
            })}
            autoComplete="off"
            className="min-h-11"
          />
          <Button
            type="button"
            className="min-h-11"
            variant={mode === 'rollback' ? 'destructive' : 'default'}
            disabled={!valid || busy}
            onClick={() => void onConfirm(confirmation)}
          >
            {busy ? t('scaffold.processing') : mode === 'scaffold' ? t('scaffold.apply') : t('scaffold.rollback')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default GovernanceScaffoldPreviewDrawer;

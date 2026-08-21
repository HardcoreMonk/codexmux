import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  TScaffoldArtifactId,
} from '@/lib/governance/scaffold-contracts';

interface IGovernanceScaffoldPreviewDrawerProps {
  preview: IScaffoldPreview | IGovernanceRollbackPreview | null;
  mode: 'scaffold' | 'rollback';
  busy: boolean;
  onConfirm: (confirmation: string) => void | Promise<void>;
  onRepreview?: (adoptArtifacts: TScaffoldArtifactId[]) => void | Promise<void>;
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
  onRepreview,
  onOpenChange,
}: IGovernanceScaffoldPreviewDrawerProps) => {
  const t = useTranslations('governance');
  const [confirmationState, setConfirmationState] = useState({ token: '', value: '' });
  const [adoptionSelectionState, setAdoptionSelectionState] = useState<{
    token: string;
    artifacts: TScaffoldArtifactId[];
  }>({ token: '', artifacts: [] });
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (!preview) return;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [preview]);

  const confirmation = confirmationState.token === preview?.token ? confirmationState.value : '';
  const adoptionSelection = adoptionSelectionState.token === preview?.token
    ? adoptionSelectionState.artifacts
    : [];
  const remainingSeconds = preview
    ? Math.max(0, Math.ceil((preview.expiresAt - currentTime) / 1_000))
    : 0;

  const hasConflict = Boolean(preview && preview.artifacts.some((artifact) => artifact.state === 'conflict'));
  const adoptionAvailable = preview && isScaffoldPreview(preview)
    ? preview.artifacts.filter((artifact) => artifact.state === 'adoption-available')
    : [];
  const adopted = preview && isScaffoldPreview(preview)
    ? preview.artifacts.filter((artifact) => artifact.state === 'adopt')
    : [];
  const hasAdoptionAvailable = adoptionAvailable.length > 0;
  const hasScaffoldChange = Boolean(preview && (!isScaffoldPreview(preview)
    || preview.artifacts.some((artifact) => ['create', 'marker-update', 'adopt'].includes(artifact.state))));
  const hasNonAdoptionChange = Boolean(preview && isScaffoldPreview(preview)
    && preview.artifacts.some((artifact) => artifact.state === 'create' || artifact.state === 'marker-update'));
  const valid = Boolean(
    preview && remainingSeconds > 0 && confirmation === preview.projectTitle
      && !hasConflict && !hasAdoptionAvailable && hasScaffoldChange,
  );
  const canRepreview = remainingSeconds > 0
    && (adoptionSelection.length > 0 || hasNonAdoptionChange);

  const toggleAdoption = (id: TScaffoldArtifactId, checked: boolean): void => {
    const current = adoptionSelectionState.token === preview?.token
      ? adoptionSelectionState.artifacts
      : [];
    setAdoptionSelectionState({
      token: preview?.token ?? '',
      artifacts: checked ? [...current, id] : current.filter((candidate) => candidate !== id),
    });
  };

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
              {adopted.length > 0 && (
                <div className="rounded-md border border-ui-yellow/30 bg-ui-yellow/5 p-3 text-xs">
                  {t('scaffold.adoptionSummary', {
                    count: adopted.length,
                    paths: adopted.map((artifact) => artifact.path).join(', '),
                  })}
                </div>
              )}
              {preview.artifacts.filter((artifact) => artifact.state !== 'skipped').map((artifact) => (
                <section key={artifact.id} className="overflow-hidden rounded-md border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2 text-xs">
                    <span className="font-mono font-medium">{artifact.path}</span>
                    <span>{t(`scaffold.artifactState.${artifact.state}`)} · v{artifact.toVersion}</span>
                  </div>
                  {artifact.state === 'adoption-available' && (
                    <label className="flex min-h-11 items-start gap-3 p-3 text-xs">
                      <Checkbox
                        aria-label={t('scaffold.adoptionSelect', { path: artifact.path })}
                        checked={adoptionSelection.includes(artifact.id)}
                        onCheckedChange={(checked) => toggleAdoption(artifact.id, checked === true)}
                      />
                      <span>
                        <span className="block font-medium">{t('scaffold.adoptionSelect', { path: artifact.path })}</span>
                        <span className="mt-1 block text-muted-foreground">
                          {t('scaffold.adoptionAvailableDescription')}
                        </span>
                      </span>
                    </label>
                  )}
                  {artifact.state === 'adopt' && (
                    <div className="border-b border-ui-yellow/20 bg-ui-yellow/5 p-3 text-xs">
                      {t('scaffold.adoptionSemanticWarning')}
                    </div>
                  )}
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
          {hasAdoptionAvailable ? (
            <>
              <div className="text-xs text-muted-foreground">{t('scaffold.adoptionSelectionHint')}</div>
              <Button
                type="button"
                className="min-h-11"
                disabled={!canRepreview || busy}
                onClick={() => void onRepreview?.(adoptionSelection)}
              >
                {busy ? t('scaffold.processing') : t('scaffold.adoptionRepreview')}
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default GovernanceScaffoldPreviewDrawer;

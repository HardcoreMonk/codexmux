import { useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { IProjectDocumentDetail } from '@/lib/governance/contracts';

interface IGovernanceDocumentDrawerProps {
  detail: IProjectDocumentDetail | null;
  loading: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
}

const GovernanceDocumentDrawer = ({ detail, loading, error, onOpenChange }: IGovernanceDocumentDrawerProps) => {
  const t = useTranslations('governance');
  const open = detail !== null || loading || error !== null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-3xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{t('documentPreview')}</SheetTitle>
          <SheetDescription className="font-mono">{detail?.path ?? t('readOnly')}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading && <div className="text-xs text-muted-foreground">{t('loading')}</div>}
          {error && <div className="text-xs text-destructive">{t('genericError')}</div>}
          {detail && (
            <>
              {detail.truncated && <div className="mb-3 rounded-md bg-ui-yellow/10 p-2 text-xs text-ui-yellow">{t('truncated')}</div>}
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">{detail.markdown}</pre>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default GovernanceDocumentDrawer;

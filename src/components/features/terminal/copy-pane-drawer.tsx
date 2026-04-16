import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

interface ICopyPaneDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionName: string | null;
}

const trimTrailingBlanks = (text: string): string => text.replace(/\s+$/g, '');

const CopyPaneDrawer = ({ open, onOpenChange, sessionName }: ICopyPaneDrawerProps) => {
  const t = useTranslations('terminal');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState<string | null>(null);

  const currentKey = open && sessionName ? sessionName : null;
  if (currentKey !== fetchKey) {
    setFetchKey(currentKey);
    setContent('');
    setError(null);
    setIsLoading(currentKey !== null);
  }

  useEffect(() => {
    if (!fetchKey) return;
    let cancelled = false;

    fetch(`/api/tmux/capture?session=${encodeURIComponent(fetchKey)}`)
      .then((res) => {
        if (!res.ok) throw new Error('capture failed');
        return res.json();
      })
      .then((data: { content: string }) => {
        if (cancelled) return;
        setContent(trimTrailingBlanks(data.content ?? ''));
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(t('copyPaneCaptureFailed'));
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchKey, t]);

  const handleCopyAll = useCallback(async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      toast.success(t('copyPaneSuccess'), { duration: 1500 });
      onOpenChange(false);
    } catch {
      toast.error(t('copyPaneCopyFailed'));
    }
  }, [content, onOpenChange, t]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[80dvh] data-[vaul-drawer-direction=bottom]:max-h-[80dvh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle>{t('copyPaneDrawerTitle')}</DrawerTitle>
          <p className="text-xs text-muted-foreground">{t('copyPaneDrawerHint')}</p>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
              {t('copyPaneLoading')}
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center py-8 text-sm text-ui-red">
              {error}
            </div>
          ) : (
            <textarea
              value={content}
              readOnly
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="min-h-0 flex-1 w-full resize-none rounded border border-border bg-muted/30 p-3 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
            />
          )}

          <Button
            onClick={handleCopyAll}
            disabled={isLoading || !!error || !content}
            className="w-full"
          >
            <Copy className="mr-2 h-4 w-4" />
            {t('copyPaneCopyAll')}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default CopyPaneDrawer;

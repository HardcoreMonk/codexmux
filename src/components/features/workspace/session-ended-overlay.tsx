import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ISessionEndedOverlayProps {
  visible: boolean;
  onNewSession: () => void;
}

const SessionEndedOverlay = ({
  visible,
  onNewSession,
}: ISessionEndedOverlayProps) => {
  const t = useTranslations('terminal');

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 bg-terminal-bg/90 pb-8 pt-6 transition-opacity duration-150',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <span className="text-sm text-muted-foreground">{t('sessionEnded')}</span>
      <Button variant="outline" size="sm" onClick={onNewSession}>
        {t('startNewSession')}
      </Button>
    </div>
  );
};

export default SessionEndedOverlay;

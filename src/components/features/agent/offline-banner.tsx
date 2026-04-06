import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

interface IOfflineBannerProps {
  isRestarting: boolean;
  error?: string | null;
  onRestart: () => void;
}

const OfflineBanner = ({ isRestarting, error, onRestart }: IOfflineBannerProps) => {
  const t = useTranslations('agent');
  return (
    <div className="mb-4 rounded-lg border border-negative/20 bg-negative/10 p-3">
      <div className="flex items-center gap-2">
        {isRestarting ? (
          <>
            <Spinner size={12} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('restarting')}</span>
          </>
        ) : (
          <>
            <AlertTriangle size={14} className="text-negative" />
            <span className="text-sm">
              {error ?? t('offlineDefault')}
            </span>
            <Button variant="outline" size="sm" className="ml-auto h-7" onClick={onRestart}>
              {t('restart')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default OfflineBanner;
